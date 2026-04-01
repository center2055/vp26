from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Iterable

from vpmobil import KlassenVertretungsTag, LehrerVertretungsTag, RaumVertretungsTag

from app.schemas import (
    CourseItem,
    DutyItem,
    EntityPlan,
    EntityStats,
    ExamItem,
    FetchPlanRequest,
    LessonChangeFlags,
    LessonItem,
    PlanMeta,
    PlanResponse,
    PlanScope,
)


def _format_time(value) -> str | None:
    return value.strftime("%H:%M") if value else None


def _format_datetime(value) -> str | None:
    return value.isoformat(timespec="minutes") if value else None


def _duration_minutes(value: timedelta | None) -> int | None:
    if value is None:
        return None
    return int(value.total_seconds() // 60)


def _scope_label(scope: PlanScope) -> str:
    return {
        "classes": "Klassenplan",
        "teachers": "Lehrerplan",
        "rooms": "Raumplan",
    }[scope]


def _entity_map(plan_tag, scope: PlanScope) -> dict[str, object]:
    if scope == "classes" and isinstance(plan_tag, KlassenVertretungsTag):
        return plan_tag.klassen
    if scope == "teachers" and isinstance(plan_tag, LehrerVertretungsTag):
        return plan_tag.lehrer
    if scope == "rooms" and isinstance(plan_tag, RaumVertretungsTag):
        return getattr(plan_tag, "räume")
    raise ValueError(f"Plan type does not match requested scope '{scope}'.")


def serialize_lesson(lesson) -> LessonItem:
    is_cancelled = lesson.ausfall
    is_changed = lesson.geändert
    status = "cancelled" if is_cancelled else "changed" if is_changed else "scheduled"

    return LessonItem(
        id=f"{lesson.periode}-{lesson.kursnummer or 'free'}-{','.join(lesson.klassen or ['-'])}",
        period=lesson.periode,
        start_time=_format_time(lesson.beginn),
        end_time=_format_time(lesson.ende),
        subject=lesson.fach,
        classes=list(lesson.klassen or []),
        teachers=list(lesson.lehrer or []),
        rooms=list(getattr(lesson, "räume") or []),
        info=lesson.info,
        course_number=lesson.kursnummer,
        status=status,
        is_changed=is_changed,
        is_cancelled=is_cancelled,
        changes=LessonChangeFlags(
            subject=getattr(lesson, "fachgeändert"),
            teacher=getattr(lesson, "lehrergeändert"),
            room=getattr(lesson, "raumgeändert"),
            class_name=getattr(lesson, "klassegeändert"),
        ),
    )


def serialize_course(course) -> CourseItem:
    return CourseItem(
        number=course.kursnummer,
        label=getattr(course, "kürzel"),
        subject=course.fach,
        teacher=course.lehrer,
    )


def serialize_exam(exam) -> ExamItem:
    return ExamItem(
        course=exam.kurs,
        teacher=exam.lehrer,
        period=exam.periode,
        starts_at=_format_time(exam.beginn),
        duration_minutes=_duration_minutes(exam.dauer),
        info=exam.info,
    )


def serialize_duty(duty) -> DutyItem:
    return DutyItem(
        before_period=duty.vorStunde,
        time=duty.zeit,
        clock_time=_format_time(duty.uhrzeit),
        location=duty.ort,
    )


def _flatten_lessons(entity) -> list[LessonItem]:
    lessons: list[LessonItem] = []
    for period in sorted(entity.stunden):
        lessons.extend(serialize_lesson(lesson) for lesson in entity.stunden[period])
    return lessons


def _entity_stats(lessons: Iterable[LessonItem]) -> EntityStats:
    lesson_list = list(lessons)
    return EntityStats(
        lesson_count=len(lesson_list),
        changed_count=sum(1 for lesson in lesson_list if lesson.is_changed),
        cancelled_count=sum(1 for lesson in lesson_list if lesson.is_cancelled),
    )


def serialize_entity(entity, scope: PlanScope) -> EntityPlan:
    lessons = _flatten_lessons(entity)
    entity_id = getattr(entity, "kürzel")

    courses = []
    exams = []
    duties = []

    if scope == "classes":
        courses = [serialize_course(course) for course in entity.kurse.values()]
        exams = [serialize_exam(exam) for exam in entity.klausuren]
    if scope == "teachers":
        duties = [serialize_duty(duty) for duty in entity.aufsichten]

    return EntityPlan(
        id=entity_id,
        label=entity_id,
        scope=scope,
        stats=_entity_stats(lessons),
        lessons=lessons,
        courses=courses,
        exams=exams,
        duties=duties,
    )


def serialize_plan(plan_tag, request: FetchPlanRequest, source: str = "vpmobil") -> PlanResponse:
    entities = [
        serialize_entity(entity, request.scope)
        for _, entity in sorted(_entity_map(plan_tag, request.scope).items(), key=lambda item: item[0])
    ]

    if request.entity_id:
        entities = [entity for entity in entities if entity.id.lower() == request.entity_id.lower()]

    active_entity_id = request.entity_id if entities else None
    if active_entity_id is None and entities:
        active_entity_id = entities[0].id

    total_lessons = sum(entity.stats.lesson_count for entity in entities)
    changed_lessons = sum(entity.stats.changed_count for entity in entities)
    cancelled_lessons = sum(entity.stats.cancelled_count for entity in entities)

    return PlanResponse(
        meta=PlanMeta(
            source=source,
            scope=request.scope,
            requested_date=request.date,
            headline=f"{_scope_label(request.scope)} am {request.date.strftime('%d.%m.%Y')}",
            published_at=_format_datetime(getattr(plan_tag, "zeitstempel", None)),
            fetched_at=datetime.now().isoformat(timespec="seconds"),
            additional_info=getattr(plan_tag, "zusatzInfo", None),
            free_days=list(getattr(plan_tag, "freieTage", [])),
            sick_teachers=list(getattr(plan_tag, "lehrerKrank", [])),
            total_entities=len(entities),
            total_lessons=total_lessons,
            changed_lessons=changed_lessons,
            cancelled_lessons=cancelled_lessons,
            active_entity_id=active_entity_id,
        ),
        entities=entities,
    )


def serialize_empty_plan(
    request: FetchPlanRequest,
    *,
    source: str = "vpmobil",
    additional_info: str | None = None,
    free_days: Iterable[date] | None = None,
) -> PlanResponse:
    resolved_free_days = sorted(set(free_days or []))
    if request.date not in resolved_free_days:
        resolved_free_days.append(request.date)

    return PlanResponse(
        meta=PlanMeta(
            source=source,
            scope=request.scope,
            requested_date=request.date,
            headline=f"{_scope_label(request.scope)} am {request.date.strftime('%d.%m.%Y')}",
            published_at=None,
            fetched_at=datetime.now().isoformat(timespec="seconds"),
            additional_info=additional_info
            or "Für dieses Datum liegt keine Plan-Datei vor. Das ist oft ein freier Tag, Ferien oder noch nicht veröffentlicht.",
            free_days=resolved_free_days,
            sick_teachers=[],
            total_entities=0,
            total_lessons=0,
            changed_lessons=0,
            cancelled_lessons=0,
            active_entity_id=None,
        ),
        entities=[],
    )
