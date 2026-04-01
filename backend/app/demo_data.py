from __future__ import annotations

from datetime import date, datetime

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


def _stats(lessons: list[LessonItem]) -> EntityStats:
    return EntityStats(
        lesson_count=len(lessons),
        changed_count=sum(1 for lesson in lessons if lesson.is_changed),
        cancelled_count=sum(1 for lesson in lessons if lesson.is_cancelled),
    )


def _lesson(
    *,
    period: int,
    subject: str | None,
    classes: list[str],
    teachers: list[str],
    rooms: list[str],
    status: str,
    start_time: str,
    end_time: str,
    info: str | None = None,
    course_number: int | None = None,
    subject_changed: bool = False,
    teacher_changed: bool | None = False,
    room_changed: bool | None = False,
    class_changed: bool | None = False,
) -> LessonItem:
    return LessonItem(
        id=f"{period}-{course_number or 'free'}-{subject or '---'}",
        period=period,
        start_time=start_time,
        end_time=end_time,
        subject=subject,
        classes=classes,
        teachers=teachers,
        rooms=rooms,
        info=info,
        course_number=course_number,
        status=status,
        is_changed=status != "scheduled",
        is_cancelled=status == "cancelled",
        changes=LessonChangeFlags(
            subject=subject_changed,
            teacher=teacher_changed,
            room=room_changed,
            class_name=class_changed,
        ),
    )


def _class_entities() -> list[EntityPlan]:
    ten_a_lessons = [
        _lesson(
            period=1,
            subject="Mathe",
            classes=["10A"],
            teachers=["KR"],
            rooms=["B-204"],
            status="scheduled",
            start_time="08:00",
            end_time="08:45",
            course_number=301,
        ),
        _lesson(
            period=2,
            subject="Deutsch",
            classes=["10A"],
            teachers=["SR"],
            rooms=["B-112"],
            status="changed",
            start_time="08:50",
            end_time="09:35",
            info="Raumwechsel wegen Projektprüfung.",
            course_number=118,
            room_changed=True,
        ),
        _lesson(
            period=4,
            subject=None,
            classes=["10A"],
            teachers=[],
            rooms=[],
            status="cancelled",
            start_time="10:40",
            end_time="11:25",
            info="Entfall, Aufgaben in Teams.",
            course_number=212,
            subject_changed=True,
            teacher_changed=True,
            room_changed=True,
        ),
        _lesson(
            period=5,
            subject="Biologie",
            classes=["10A"],
            teachers=["MK"],
            rooms=["N-Lab"],
            status="changed",
            start_time="11:45",
            end_time="12:30",
            info="Doppelstunde mit 10B zusammengelegt.",
            course_number=444,
            class_changed=True,
        ),
    ]

    q2_lessons = [
        _lesson(
            period=1,
            subject="LK Geschichte",
            classes=["Q2"],
            teachers=["AH"],
            rooms=["Aula"],
            status="scheduled",
            start_time="08:00",
            end_time="09:35",
            info="Klausurvorbereitung",
            course_number=810,
        ),
        _lesson(
            period=3,
            subject="LK Englisch",
            classes=["Q2"],
            teachers=["JP"],
            rooms=["C-301"],
            status="changed",
            start_time="09:55",
            end_time="11:25",
            info="Vertretung durch Frau Neumann.",
            course_number=811,
            teacher_changed=True,
        ),
    ]

    eight_b_lessons = [
        _lesson(
            period=2,
            subject="Sport",
            classes=["8B"],
            teachers=["TB"],
            rooms=["Sporthalle"],
            status="scheduled",
            start_time="08:50",
            end_time="09:35",
            course_number=520,
        ),
        _lesson(
            period=3,
            subject="Physik",
            classes=["8B"],
            teachers=["FM"],
            rooms=["E-105"],
            status="changed",
            start_time="09:55",
            end_time="10:40",
            info="Mit 8A gemeinsam im Experimentierraum.",
            course_number=521,
            room_changed=True,
            class_changed=True,
        ),
    ]

    return [
        EntityPlan(
            id="10A",
            label="10A",
            scope="classes",
            stats=_stats(ten_a_lessons),
            lessons=ten_a_lessons,
            courses=[
                CourseItem(number=301, label="M", subject="Mathe", teacher="KR"),
                CourseItem(number=118, label="D", subject="Deutsch", teacher="SR"),
                CourseItem(number=444, label="Bio", subject="Biologie", teacher="MK"),
            ],
            exams=[],
            duties=[],
        ),
        EntityPlan(
            id="Q2",
            label="Q2",
            scope="classes",
            stats=_stats(q2_lessons),
            lessons=q2_lessons,
            courses=[
                CourseItem(number=810, label="LK GE", subject="Geschichte", teacher="AH"),
                CourseItem(number=811, label="LK EN", subject="Englisch", teacher="JP"),
            ],
            exams=[
                ExamItem(
                    course="LK Geschichte",
                    teacher="AH",
                    period=1,
                    starts_at="08:00",
                    duration_minutes=90,
                    info="Materialausgabe 10 Minuten vorher.",
                )
            ],
            duties=[],
        ),
        EntityPlan(
            id="8B",
            label="8B",
            scope="classes",
            stats=_stats(eight_b_lessons),
            lessons=eight_b_lessons,
            courses=[
                CourseItem(number=520, label="Sp", subject="Sport", teacher="TB"),
                CourseItem(number=521, label="Ph", subject="Physik", teacher="FM"),
            ],
            exams=[],
            duties=[],
        ),
    ]


def _teacher_entities() -> list[EntityPlan]:
    ah_lessons = [
        _lesson(
            period=1,
            subject="LK Geschichte",
            classes=["Q2"],
            teachers=["AH"],
            rooms=["Aula"],
            status="scheduled",
            start_time="08:00",
            end_time="09:35",
            course_number=810,
        ),
        _lesson(
            period=5,
            subject="Geschichte",
            classes=["10C"],
            teachers=["AH"],
            rooms=["B-109"],
            status="changed",
            start_time="11:45",
            end_time="12:30",
            info="Vertretung für Frau Berg.",
            course_number=812,
            class_changed=True,
        ),
    ]

    mk_lessons = [
        _lesson(
            period=4,
            subject="Biologie",
            classes=["10A", "10B"],
            teachers=["MK"],
            rooms=["N-Lab"],
            status="changed",
            start_time="10:40",
            end_time="11:25",
            info="Zusammengelegt im Labor.",
            course_number=444,
            class_changed=True,
        ),
        _lesson(
            period=6,
            subject="NW",
            classes=["7A"],
            teachers=["MK"],
            rooms=["N-202"],
            status="scheduled",
            start_time="12:35",
            end_time="13:20",
            course_number=445,
        ),
    ]

    sr_lessons = [
        _lesson(
            period=2,
            subject="Deutsch",
            classes=["10A"],
            teachers=["SR"],
            rooms=["B-112"],
            status="changed",
            start_time="08:50",
            end_time="09:35",
            info="Raumwechsel wegen Projektprüfung.",
            course_number=118,
            room_changed=True,
        )
    ]

    return [
        EntityPlan(
            id="AH",
            label="AH",
            scope="teachers",
            stats=_stats(ah_lessons),
            lessons=ah_lessons,
            courses=[],
            exams=[],
            duties=[
                DutyItem(
                    before_period=3,
                    time="Frühaufsicht",
                    clock_time="09:40",
                    location="Nordflur",
                )
            ],
        ),
        EntityPlan(
            id="MK",
            label="MK",
            scope="teachers",
            stats=_stats(mk_lessons),
            lessons=mk_lessons,
            courses=[],
            exams=[],
            duties=[],
        ),
        EntityPlan(
            id="SR",
            label="SR",
            scope="teachers",
            stats=_stats(sr_lessons),
            lessons=sr_lessons,
            courses=[],
            exams=[],
            duties=[
                DutyItem(
                    before_period=5,
                    time="Pausenaufsicht",
                    clock_time="11:25",
                    location="Innenhof",
                )
            ],
        ),
    ]


def _room_entities() -> list[EntityPlan]:
    aula_lessons = [
        _lesson(
            period=1,
            subject="LK Geschichte",
            classes=["Q2"],
            teachers=["AH"],
            rooms=["Aula"],
            status="scheduled",
            start_time="08:00",
            end_time="09:35",
            course_number=810,
        ),
        _lesson(
            period=6,
            subject="Chor",
            classes=["AG"],
            teachers=["LS"],
            rooms=["Aula"],
            status="scheduled",
            start_time="12:35",
            end_time="13:20",
            course_number=990,
        ),
    ]

    lab_lessons = [
        _lesson(
            period=4,
            subject="Biologie",
            classes=["10A", "10B"],
            teachers=["MK"],
            rooms=["N-Lab"],
            status="changed",
            start_time="10:40",
            end_time="11:25",
            info="Zwei Kurse im selben Laborblock.",
            course_number=444,
            class_changed=True,
        )
    ]

    b112_lessons = [
        _lesson(
            period=2,
            subject="Deutsch",
            classes=["10A"],
            teachers=["SR"],
            rooms=["B-112"],
            status="changed",
            start_time="08:50",
            end_time="09:35",
            info="Temporärer Ausweichraum.",
            course_number=118,
            room_changed=True,
        )
    ]

    return [
        EntityPlan(
            id="Aula",
            label="Aula",
            scope="rooms",
            stats=_stats(aula_lessons),
            lessons=aula_lessons,
        ),
        EntityPlan(
            id="N-Lab",
            label="N-Lab",
            scope="rooms",
            stats=_stats(lab_lessons),
            lessons=lab_lessons,
        ),
        EntityPlan(
            id="B-112",
            label="B-112",
            scope="rooms",
            stats=_stats(b112_lessons),
            lessons=b112_lessons,
        ),
    ]


def _headline(scope: PlanScope, requested_date: date) -> str:
    label = {
        "classes": "Klassenplan",
        "teachers": "Lehrerplan",
        "rooms": "Raumplan",
    }[scope]
    return f"{label} am {requested_date.strftime('%d.%m.%Y')}"


def get_demo_plan(request: FetchPlanRequest) -> PlanResponse:
    entities_by_scope = {
        "classes": _class_entities(),
        "teachers": _teacher_entities(),
        "rooms": _room_entities(),
    }
    entities = entities_by_scope[request.scope]

    if request.entity_id:
        entities = [entity for entity in entities if entity.id.lower() == request.entity_id.lower()]

    active_entity_id = request.entity_id if entities else None
    if active_entity_id is None and entities:
        active_entity_id = entities[0].id

    return PlanResponse(
        meta=PlanMeta(
            source="demo",
            scope=request.scope,
            requested_date=request.date,
            headline=_headline(request.scope, request.date),
            published_at=f"{request.date.isoformat()}T06:20",
            fetched_at=datetime.now().isoformat(timespec="seconds"),
            additional_info="Demo-Daten für die neue Oberfläche. Live-Zugangsdaten können jederzeit im rechten Panel getestet werden.",
            free_days=[],
            sick_teachers=["TB"],
            total_entities=len(entities),
            total_lessons=sum(entity.stats.lesson_count for entity in entities),
            changed_lessons=sum(entity.stats.changed_count for entity in entities),
            cancelled_lessons=sum(entity.stats.cancelled_count for entity in entities),
            active_entity_id=active_entity_id,
        ),
        entities=entities,
    )
