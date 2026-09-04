from __future__ import annotations

import os
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from app.schemas import (
    PlanResponse,
    TeacherAnalyticsEntry,
    TeacherAnalyticsResponse,
    TeacherAnalyticsSummary,
    TeacherDayHistoryEntry,
)


def _get_db_path() -> Path:
    custom_path = os.environ.get(VP26_DB_PATH)
    if custom_path:
        path = Path(custom_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    data_dir = Path(__file__).resolve().parent.parent
    return data_dir / vp26.db


def init_db() -> None:
    db_path = _get_db_path()
    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "
            CREATE TABLE IF NOT EXISTS school_days (
                date TEXT NOT NULL,
                school_id INTEGER NOT NULL,
                scope TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                total_entities INTEGER NOT NULL DEFAULT 0,
                total_lessons INTEGER NOT NULL DEFAULT 0,
                changed_lessons INTEGER NOT NULL DEFAULT 0,
                cancelled_lessons INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (date, school_id, scope)
            );
            "
        )
        cursor.execute(
            "
            CREATE TABLE IF NOT EXISTS teacher_daily_records (
                date TEXT NOT NULL,
                school_id INTEGER NOT NULL,
                teacher_id TEXT NOT NULL,
                is_sick INTEGER NOT NULL DEFAULT 0,
                total_blocks INTEGER NOT NULL DEFAULT 0,
                changed_blocks INTEGER NOT NULL DEFAULT 0,
                cancelled_blocks INTEGER NOT NULL DEFAULT 0,
                subjects TEXT NOT NULL DEFAULT '',
                classes TEXT NOT NULL DEFAULT '',
                rooms TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL,
                PRIMARY KEY (date, school_id, teacher_id)
            );
            "
        )
        cursor.execute(
            "
            CREATE INDEX IF NOT EXISTS idx_teacher_date ON teacher_daily_records(date, school_id);
            "
        )
        cursor.execute(
            "
            CREATE INDEX IF NOT EXISTS idx_teacher_name ON teacher_daily_records(teacher_id, school_id);
            "
        )
        conn.commit()


def _unique_sorted(items: list[str]) -> list[str]:
    return sorted({item.strip() for item in items if item and item.strip()})


def record_plan(plan: PlanResponse, school_id: int = 0) -> None:
    init_db()
    db_path = _get_db_path()
    requested_date_str = (
        plan.meta.requested_date.isoformat()
        if isinstance(plan.meta.requested_date, (date, datetime))
        else str(plan.meta.requested_date)
    )
    now_iso = datetime.now().astimezone().isoformat()

    sick_set = {
        teacher.strip().upper() for teacher in plan.meta.sick_teachers if teacher and teacher.strip()
    }

    # Aggregate teachers by extracting lessons
    teacher_stats: dict[
        str,
        dict[str, Any],
    ] = {}

    def ensure_teacher(tid: str):
        normalized = tid.strip().upper()
        if normalized not in teacher_stats:
            teacher_stats[normalized] = {
                is_sick: 1 if normalized in sick_set else 0,
                total_blocks: 0,
                changed_blocks: 0,
                cancelled_blocks: 0,
                subjects: set(),
                classes: set(),
                rooms: set(),
            }
        return teacher_stats[normalized]

    for sick_teacher in sick_set:
        ensure_teacher(sick_teacher)

    for entity in plan.entities:
        for lesson in entity.lessons:
            teachers = [t.strip().upper() for t in lesson.teachers if t and t.strip()]
            for teacher in teachers:
                stats = ensure_teacher(teacher)
                stats[total_blocks] += 1
                if lesson.is_changed:
                    stats[changed_blocks] += 1
                if lesson.is_cancelled:
                    stats[cancelled_blocks] += 1
                if lesson.subject:
                    stats[subjects].add(lesson.subject.strip())
                for cls in lesson.classes:
                    if cls.strip():
                        stats[classes].add(cls.strip())
                for rm in lesson.rooms:
                    if rm.strip():
                        stats[rooms].add(rm.strip())

    with sqlite3.connect(db_path) as conn:
        cursor = conn.cursor()

        # Update school_days
        cursor.execute(
            "
            INSERT INTO school_days (date, school_id, scope, fetched_at, total_entities, total_lessons, changed_lessons, cancelled_lessons)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, school_id, scope) DO UPDATE SET
                fetched_at = excluded.fetched_at,
                total_entities = excluded.total_entities,
                total_lessons = excluded.total_lessons,
                changed_lessons = excluded.changed_lessons,
                cancelled_lessons = excluded.cancelled_lessons
            ",
            (
                requested_date_str,
                school_id,
                plan.meta.scope,
                now_iso,
                plan.meta.total_entities,
                plan.meta.total_lessons,
                plan.meta.changed_lessons,
                plan.meta.cancelled_lessons,
            ),
        )

        # Upsert teacher daily records
        for teacher_id, stats in teacher_stats.items():
            subjects_str = ,.join(_unique_sorted(list(stats[subjects])))
            classes_str = ,.join(_unique_sorted(list(stats[classes])))
            rooms_str = ,.join(_unique_sorted(list(stats[rooms])))

            cursor.execute(
                "
                INSERT INTO teacher_daily_records (
                    date, school_id, teacher_id, is_sick, total_blocks, changed_blocks, cancelled_blocks, subjects, classes, rooms, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(date, school_id, teacher_id) DO UPDATE SET
                    is_sick = excluded.is_sick,
                    total_blocks = excluded.total_blocks,
                    changed_blocks = excluded.changed_blocks,
                    cancelled_blocks = excluded.cancelled_blocks,
                    subjects = excluded.subjects,
                    classes = excluded.classes,
                    rooms = excluded.rooms,
                    updated_at = excluded.updated_at
                ",
                (
                    requested_date_str,
                    school_id,
                    teacher_id,
                    stats[is_sick],
                    stats[total_blocks],
                    stats[changed_blocks],
                    stats[cancelled_blocks],
                    subjects_str,
                    classes_str,
                    rooms_str,
                    now_iso,
                ),
            )

        conn.commit()


def get_teacher_analytics(
    school_id: int = 0,
    from_date: str | None = None,
    to_date: str | None = None,
    days: int = 30,
) -> TeacherAnalyticsResponse:
    init_db()
    db_path = _get_db_path()

    today_val = date.today()
    if not to_date:
        to_date = today_val.isoformat()
    if not from_date:
        from_date = (today_val - timedelta(days=days)).isoformat()

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Count distinct tracked days in period
        cursor.execute(
            "
            SELECT COUNT(DISTINCT date) as day_count FROM school_days
            WHERE date >= ? AND date <= ?
            ",
            (from_date, to_date),
        )
        row = cursor.fetchone()
        tracked_days = row[day_count] if row else 0

        # Query aggregated teacher records
        cursor.execute(
            "
            SELECT
                teacher_id,
                SUM(is_sick) as days_sick,
                COUNT(DISTINCT date) as days_recorded,
                SUM(CASE WHEN total_blocks > 0 THEN 1 ELSE 0 END) as days_with_blocks,
                SUM(total_blocks) as total_blocks,
                SUM(changed_blocks) as changed_blocks,
                SUM(cancelled_blocks) as cancelled_blocks,
                GROUP_CONCAT(subjects, ',') as all_subjects,
                GROUP_CONCAT(classes, ',') as all_classes,
                MAX(date) as last_seen_date,
                MAX(is_sick) as latest_is_sick
            FROM teacher_daily_records
            WHERE date >= ? AND date <= ?
            GROUP BY teacher_id
            ORDER BY days_sick DESC, cancelled_blocks DESC, changed_blocks DESC, teacher_id ASC
            ",
            (from_date, to_date),
        )
        teacher_rows = cursor.fetchall()

    entries: list[TeacherAnalyticsEntry] = []
    total_sick_events = 0
    total_cancelled_all = 0
    total_changed_all = 0
    total_blocks_all = 0

    for r in teacher_rows:
        tid = r[teacher_id]
        days_sick = int(r[days_sick] or 0)
        days_recorded = int(r[days_recorded] or 0)
        days_with_blocks = int(r[days_with_blocks] or 0)
        total_b = int(r[total_blocks] or 0)
        changed_b = int(r[changed_blocks] or 0)
        cancelled_b = int(r[cancelled_blocks] or 0)

        total_sick_events += days_sick
        total_cancelled_all += cancelled_b
        total_changed_all += changed_b
        total_blocks_all += total_b

        # Split and deduplicate subjects and classes
        raw_subjects = (r[all_subjects] or ").split(,)
 raw_classes = (r[all_classes] or ).split(,)
 subjects = _unique_sorted(raw_subjects)
 classes = _unique_sorted(raw_classes)

 cancellation_rate = (
 round((cancelled_b / total_b) * 100, 1) if total_b > 0 else 0.0
 )
 absence_rate = (
 round((days_sick / tracked_days) * 100, 1) if tracked_days > 0 else 0.0
 )

 entries.append(
 TeacherAnalyticsEntry(
 id=tid,
 label=tid,
 days_sick=days_sick,
 days_recorded=days_recorded,
 days_with_blocks=days_with_blocks,
 total_blocks=total_b,
 changed_blocks=changed_b,
 cancelled_blocks=cancelled_b,
 subjects=subjects,
 classes=classes,
 last_seen_date=r[last_seen_date],
 cancellation_rate=cancellation_rate,
 absence_rate=absence_rate,
 is_currently_sick=bool(r[latest_is_sick] and r[last_seen_date] == to_date),
 )
 )

 summary = TeacherAnalyticsSummary(
 from_date=from_date,
 to_date=to_date,
 tracked_days=tracked_days,
 total_teachers=len(entries),
 total_sick_events=total_sick_events,
 total_cancelled_blocks=total_cancelled_all,
 total_changed_blocks=total_changed_all,
 total_blocks=total_blocks_all,
 )

 return TeacherAnalyticsResponse(
 summary=summary,
 teachers=entries,
 )


def get_teacher_history(
 teacher_id: str,
 school_id: int = 0,
 limit: int = 60,
) -> list[TeacherDayHistoryEntry]:
 init_db()
 db_path = _get_db_path()
 normalized_tid = teacher_id.strip().upper()

 with sqlite3.connect(db_path) as conn:
 conn.row_factory = sqlite3.Row
 cursor = conn.cursor()
 cursor.execute(
 "
 SELECT date, is_sick, total_blocks, changed_blocks, cancelled_blocks, subjects, classes, rooms
 FROM teacher_daily_records
 WHERE teacher_id = ?
 ORDER BY date DESC
 LIMIT ?
 ",
 (normalized_tid, limit),
 )
 rows = cursor.fetchall()

 history: list[TeacherDayHistoryEntry] = []
 for r in rows:
 subjects = _unique_sorted((r[subjects] or ).split(,))
 classes = _unique_sorted((r[classes] or ).split(,))
 rooms = _unique_sorted((r[rooms] or ).split(,))

 history.append(
 TeacherDayHistoryEntry(
 date=r[date],
 is_sick=bool(r[is_sick]),
 total_blocks=r[total_blocks],
 changed_blocks=r[changed_blocks],
 cancelled_blocks=r[cancelled_blocks],
 subjects=subjects,
 classes=classes,
 rooms=rooms,
 )
 )

 return history
