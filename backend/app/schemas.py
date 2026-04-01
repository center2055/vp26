from __future__ import annotations

from datetime import date as DateValue
from typing import Literal

from pydantic import BaseModel, Field


PlanScope = Literal["classes", "teachers", "rooms"]
PlanSource = Literal["demo", "vpmobil"]
LessonStatus = Literal["scheduled", "changed", "cancelled"]


class FetchPlanRequest(BaseModel):
    demo: bool = False
    school_id: int | None = Field(default=None, ge=1)
    username: str | None = Field(default=None, max_length=128)
    password: str | None = Field(default=None, max_length=256)
    server_domain: str = Field(default="stundenplan24.de", max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    scope: PlanScope = "classes"
    date: DateValue = Field(default_factory=DateValue.today)
    entity_id: str | None = Field(default=None, max_length=64)


class LessonChangeFlags(BaseModel):
    subject: bool
    teacher: bool | None
    room: bool | None
    class_name: bool | None


class LessonItem(BaseModel):
    id: str
    period: int
    start_time: str | None
    end_time: str | None
    subject: str | None
    classes: list[str]
    teachers: list[str]
    rooms: list[str]
    info: str | None
    course_number: int | None
    status: LessonStatus
    is_changed: bool
    is_cancelled: bool
    changes: LessonChangeFlags


class CourseItem(BaseModel):
    number: int | None
    label: str | None
    subject: str | None
    teacher: str | None


class ExamItem(BaseModel):
    course: str | None
    teacher: str | None
    period: int | None
    starts_at: str | None
    duration_minutes: int | None
    info: str | None


class DutyItem(BaseModel):
    before_period: int | None
    time: str | None
    clock_time: str | None
    location: str | None


class EntityStats(BaseModel):
    lesson_count: int
    changed_count: int
    cancelled_count: int


class EntityPlan(BaseModel):
    id: str
    label: str
    scope: PlanScope
    stats: EntityStats
    lessons: list[LessonItem]
    courses: list[CourseItem] = []
    exams: list[ExamItem] = []
    duties: list[DutyItem] = []


class PlanMeta(BaseModel):
    source: PlanSource
    scope: PlanScope
    requested_date: DateValue
    headline: str
    published_at: str | None
    fetched_at: str
    additional_info: str | None
    free_days: list[DateValue]
    sick_teachers: list[str]
    total_entities: int
    total_lessons: int
    changed_lessons: int
    cancelled_lessons: int
    active_entity_id: str | None


class PlanResponse(BaseModel):
    meta: PlanMeta
    entities: list[EntityPlan]
