export type PlanScope = 'classes' | 'teachers' | 'rooms'
export type PlanSource = 'demo' | 'vpmobil'
export type LessonStatus = 'scheduled' | 'changed' | 'cancelled'

export interface FetchPlanRequest {
  demo: boolean
  server_domain?: string
  port?: number
  scope: PlanScope
  date: string
}

export interface SessionRequest {
  school_id: number
  username: string
  password: string
  server_domain?: string
  port?: number
  probe_date?: string
}

export interface SessionInfo {
  school_id: number
  username: string
  server_domain: string
  port: number | null
}

export interface SessionResponse {
  authenticated: boolean
  session: SessionInfo | null
  token?: string
}

export interface LessonChangeFlags {
  subject: boolean
  teacher: boolean | null
  room: boolean | null
  class_name: boolean | null
}

export interface LessonItem {
  id: string
  period: number
  start_time: string | null
  end_time: string | null
  subject: string | null
  classes: string[]
  teachers: string[]
  rooms: string[]
  info: string | null
  course_number: number | null
  status: LessonStatus
  is_changed: boolean
  is_cancelled: boolean
  changes: LessonChangeFlags
}

export interface CourseItem {
  number: number | null
  label: string | null
  subject: string | null
  teacher: string | null
}

export interface ExamItem {
  course: string | null
  teacher: string | null
  period: number | null
  starts_at: string | null
  duration_minutes: number | null
  info: string | null
}

export interface DutyItem {
  before_period: number | null
  time: string | null
  clock_time: string | null
  location: string | null
}

export interface EntityStats {
  lesson_count: number
  changed_count: number
  cancelled_count: number
}

export interface EntityPlan {
  id: string
  label: string
  scope: PlanScope
  stats: EntityStats
  lessons: LessonItem[]
  courses: CourseItem[]
  exams: ExamItem[]
  duties: DutyItem[]
}

export interface PlanMeta {
  source: PlanSource
  scope: PlanScope
  requested_date: string
  headline: string
  published_at: string | null
  fetched_at: string
  additional_info: string | null
  free_days: string[]
  sick_teachers: string[]
  total_entities: number
  total_lessons: number
  changed_lessons: number
  cancelled_lessons: number
  active_entity_id: string | null
}

export interface PlanResponse {
  meta: PlanMeta
  entities: EntityPlan[]
}

export interface BootstrapResponse {
  authenticated: boolean
  session: SessionInfo | null
  has_backend_defaults: boolean
  default_server_domain: string
  default_port: number | null
  default_scope: PlanScope
}

export interface TeacherAnalyticsEntry {
  id: string
  label: string
  days_sick: number
  days_recorded: number
  days_with_blocks: number
  total_blocks: number
  changed_blocks: number
  cancelled_blocks: number
  subjects: string[]
  classes: string[]
  last_seen_date: string | null
  cancellation_rate: number
  absence_rate: number
  is_currently_sick: boolean
}

export interface TeacherAnalyticsSummary {
  from_date: string
  to_date: string
  tracked_days: number
  total_teachers: number
  total_sick_events: number
  total_cancelled_blocks: number
  total_changed_blocks: number
  total_blocks: number
}

export interface TeacherAnalyticsResponse {
  summary: TeacherAnalyticsSummary
  teachers: TeacherAnalyticsEntry[]
}

export interface TeacherDayHistoryEntry {
  date: string
  is_sick: boolean
  total_blocks: number
  changed_blocks: number
  cancelled_blocks: number
  subjects: string[]
  classes: string[]
  rooms: string[]
}

