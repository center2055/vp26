import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Fragment } from 'react'

void useEffect
import {
  BellDot,
  BookOpenText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorClosed,
  FolderKanban,
  GraduationCap,
  LogOut,
  MapPinned,
  RefreshCw,
  Settings2,
} from 'lucide-react'
import { ConnectionFields } from './connection-fields'
import type { EntityPlan, LessonItem, PlanResponse } from '../types'
import {
  formatDateTime,
  formatLongDate,
  formatShortDate,
  parseLocalDate,
  scopeLabel,
  themeModeOptions,
  moveCalendarWeeks,
  workspaceSections,
  type AppSettings,
  type FormState,
  type FormUpdater,
  type SettingsUpdater,
  type WorkspaceSection,
} from '../ui'

type WorkspaceScreenProps = {
  plan: PlanResponse
  cachedPlans: PlanResponse[]
  isNativeShell: boolean
  form: FormState
  settings: AppSettings
  section: WorkspaceSection
  entitySearch: string
  selectedEntityId: string
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  notice: string | null
  lastRefreshAt: string | null
  usingCachedPlan: boolean
  onSectionChange: (section: WorkspaceSection) => void
  onEntitySearchChange: (value: string) => void
  onSelectEntity: (entityId: string) => void
  onRefresh: () => Promise<void>
  onDateChange: (date: string) => Promise<void>
  onOpenSetup: () => void
  onLogout: () => void
  onFormChange: FormUpdater
  onSettingsChange: SettingsUpdater
  onNotificationEntityChange: (entityId: string) => void
  onSubmitSettings: () => Promise<void>
}

type LessonBlock = {
  id: string
  startPeriod: number
  endPeriod: number
  startTime: string | null
  endTime: string | null
  subject: string | null
  courseNumber: number | null
  teachers: string[]
  rooms: string[]
  classes: string[]
  info: string | null
  status: LessonItem['status']
  is_changed: boolean
  is_cancelled: boolean
  lessons: LessonItem[]
}

type ScheduleSlot = {
  id: string
  startPeriod: number
  endPeriod: number
  startTime: string | null
  endTime: string | null
  blocks: LessonBlock[]
}

type TeacherTrace = {
  id: string
  startPeriod: number
  endPeriod: number
  startTime: string | null
  endTime: string | null
  subject: string | null
  rooms: string[]
  classes: string[]
  info: string | null
  status: LessonItem['status']
  is_changed: boolean
  is_cancelled: boolean
}

type TeacherBoard = {
  id: string
  label: string
  blocks: TeacherTrace[]
  rooms: string[]
  classes: string[]
  subjects: string[]
  knownRooms: string[]
  knownClasses: string[]
  knownSubjects: string[]
  blockCount: number
  changedCount: number
  cancelledCount: number
  firstStart: string | null
  lastEnd: string | null
  isSick: boolean
}

type WeeklyDay = {
  date: string
  plan: PlanResponse | null
  entity: EntityPlan | null
  slots: ScheduleSlot[]
  isCurrent: boolean
  isFreeDay: boolean
}

type WeeklyEntityChoice = {
  id: string
  label: string
  slotCount: number
  changedCount: number
  cancelledCount: number
  dayCount: number
}

type WeeklyMatrixRow = {
  id: string
  label: string
  time: string
  cells: Array<{
    day: WeeklyDay
    slot: ScheduleSlot | null
  }>
}

type RoomBoard = {
  id: string
  label: string
  slots: ScheduleSlot[]
  classes: string[]
  teachers: string[]
  subjects: string[]
  currentClasses: string[]
  currentTeachers: string[]
  currentSubjects: string[]
  slotCount: number
  changedCount: number
  cancelledCount: number
  isOccupiedNow: boolean
  currentSlot: ScheduleSlot | null
  nextSlot: ScheduleSlot | null
}

type RoomTimelineRow = {
  id: string
  startPeriod: number
  endPeriod: number
  startTime: string | null
  endTime: string | null
  slot: ScheduleSlot | null
}

const sectionIcons = {
  schedule: FolderKanban,
  week: CalendarDays,
  rooms: MapPinned,
  teachers: GraduationCap,
  settings: Settings2,
} as const

function lessonStatusLabel(lesson: { is_changed: boolean; is_cancelled: boolean }) {
  if (lesson.is_cancelled) {
    return 'Entfall'
  }
  if (lesson.is_changed) {
    return 'Geändert'
  }
  return 'Planmäßig'
}

function lessonStatusClass(lesson: { is_changed: boolean; is_cancelled: boolean }) {
  if (lesson.is_cancelled) {
    return 'status-badge status-badge--danger'
  }
  if (lesson.is_changed) {
    return 'status-badge status-badge--warning'
  }
  return 'status-badge status-badge--success'
}

function joinOrFallback(values: string[], fallback: string) {
  return values.length ? values.join(', ') : fallback
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right, 'de-DE'))
}

function upcomingFreeDays(days: string[], requestedDate: string) {
  return days.filter((day) => day >= requestedDate)
}

function lessonText(lesson: LessonItem) {
  return [
    lesson.subject,
    ...lesson.classes,
    ...lesson.teachers,
    ...lesson.rooms,
    lesson.info,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function matchesQuery(entity: EntityPlan, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true
  }

  if (entity.label.toLowerCase().includes(normalizedSearch)) {
    return true
  }

  return entity.lessons.some((lesson) => lessonText(lesson).includes(normalizedSearch))
}

function lessonBlockSignature(lesson: LessonItem) {
  return [
    lesson.subject ?? '',
    lesson.course_number ?? '',
    lesson.info ?? '',
    lesson.status,
    lesson.is_changed ? '1' : '0',
    lesson.is_cancelled ? '1' : '0',
    uniqueValues(lesson.teachers).join('|'),
    uniqueValues(lesson.rooms).join('|'),
    uniqueValues(lesson.classes).join('|'),
  ].join('::')
}

function createLessonBlock(lessons: LessonItem[]): LessonBlock {
  const first = lessons[0]
  const last = lessons[lessons.length - 1]

  return {
    id: `${first.id}-${last.id}`,
    startPeriod: first.period,
    endPeriod: last.period,
    startTime: first.start_time,
    endTime: last.end_time,
    subject: first.subject,
    courseNumber: first.course_number,
    teachers: uniqueValues(first.teachers),
    rooms: uniqueValues(first.rooms),
    classes: uniqueValues(first.classes),
    info: first.info,
    status: first.status,
    is_changed: first.is_changed,
    is_cancelled: first.is_cancelled,
    lessons,
  }
}

function buildLessonBlocks(lessons: LessonItem[]) {
  if (!lessons.length) {
    return []
  }

  const grouped = new Map<string, LessonItem[]>()

  for (const lesson of lessons) {
    const signature = lessonBlockSignature(lesson)
    const lessonGroup = grouped.get(signature) ?? []
    lessonGroup.push(lesson)
    grouped.set(signature, lessonGroup)
  }

  const blocks: LessonBlock[] = []

  for (const lessonGroup of grouped.values()) {
    const sortedGroup = [...lessonGroup].sort((left, right) => left.period - right.period)
    let currentBlockLessons: LessonItem[] = []

    for (const lesson of sortedGroup) {
      const previousLesson = currentBlockLessons[currentBlockLessons.length - 1]

      if (previousLesson && lesson.period === previousLesson.period + 1) {
        currentBlockLessons.push(lesson)
        continue
      }

      if (currentBlockLessons.length) {
        blocks.push(createLessonBlock(currentBlockLessons))
      }

      currentBlockLessons = [lesson]
    }

    if (currentBlockLessons.length) {
      blocks.push(createLessonBlock(currentBlockLessons))
    }
  }

  return blocks.sort((left, right) => {
    if (left.startPeriod !== right.startPeriod) {
      return left.startPeriod - right.startPeriod
    }

    if (left.endPeriod !== right.endPeriod) {
      return left.endPeriod - right.endPeriod
    }

    if ((left.courseNumber ?? 0) !== (right.courseNumber ?? 0)) {
      return (left.courseNumber ?? 0) - (right.courseNumber ?? 0)
    }

    if ((left.subject ?? '') !== (right.subject ?? '')) {
      return (left.subject ?? '').localeCompare(right.subject ?? '', 'de-DE')
    }

    return joinOrFallback(left.teachers, '').localeCompare(joinOrFallback(right.teachers, ''), 'de-DE')
  })
}

function buildScheduleSlots(blocks: LessonBlock[]) {
  const grouped = new Map<string, ScheduleSlot>()

  for (const block of blocks) {
    const slotKey = [block.startPeriod, block.endPeriod, block.startTime ?? '', block.endTime ?? ''].join('::')
    const existing = grouped.get(slotKey)

    if (existing) {
      existing.blocks.push(block)
      continue
    }

    grouped.set(slotKey, {
      id: slotKey,
      startPeriod: block.startPeriod,
      endPeriod: block.endPeriod,
      startTime: block.startTime,
      endTime: block.endTime,
      blocks: [block],
    })
  }

  return [...grouped.values()]
    .map((slot) => ({
      ...slot,
      blocks: [...slot.blocks].sort((left, right) => {
        if ((left.courseNumber ?? 0) !== (right.courseNumber ?? 0)) {
          return (left.courseNumber ?? 0) - (right.courseNumber ?? 0)
        }

        if ((left.subject ?? '') !== (right.subject ?? '')) {
          return (left.subject ?? '').localeCompare(right.subject ?? '', 'de-DE')
        }

        return joinOrFallback(left.teachers, '').localeCompare(joinOrFallback(right.teachers, ''), 'de-DE')
      }),
    }))
    .sort((left, right) => left.startPeriod - right.startPeriod)
}

function scheduleSlotStatusLabel(slot: ScheduleSlot) {
  if (slot.blocks.every((block) => block.is_cancelled)) {
    return 'Entfall'
  }

  if (slot.blocks.some((block) => block.is_changed || block.is_cancelled)) {
    return 'Geändert'
  }

  return 'Planmäßig'
}

function scheduleSlotStatusClass(slot: ScheduleSlot) {
  if (slot.blocks.every((block) => block.is_cancelled)) {
    return 'status-badge status-badge--danger'
  }

  if (slot.blocks.some((block) => block.is_changed || block.is_cancelled)) {
    return 'status-badge status-badge--warning'
  }

  return 'status-badge status-badge--success'
}

function scheduleRowClass(slot: ScheduleSlot) {
  if (slot.blocks.every((block) => block.is_cancelled)) {
    return 'schedule-row schedule-row--danger'
  }

  if (slot.blocks.some((block) => block.is_changed || block.is_cancelled)) {
    return 'schedule-row schedule-row--warning'
  }

  return 'schedule-row'
}

function blockPeriodLabel(block: { startPeriod: number; endPeriod: number }) {
  return block.startPeriod === block.endPeriod
    ? `${block.startPeriod}.`
    : `${block.startPeriod}.-${block.endPeriod}.`
}

function blockTimeLabel(block: { startTime: string | null; endTime: string | null }) {
  if (!block.startTime && !block.endTime) {
    return '--:--'
  }

  if (!block.endTime) {
    return block.startTime ?? '--:--'
  }

  return `${block.startTime ?? '--:--'} - ${block.endTime}`
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function shiftDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  next.setHours(12, 0, 0, 0)
  return next
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const weekday = next.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  next.setDate(next.getDate() + diff)
  next.setHours(12, 0, 0, 0)
  return next
}

function buildDateStrip(currentDate: string, freeDaySet: Set<string>) {
  void freeDaySet
  const weekStart = startOfWeek(parseLocalDate(currentDate))

  return Array.from({ length: 5 }, (_, index) => toLocalDateString(shiftDays(weekStart, index)))
}

function formatDateChip(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
    .format(parseLocalDate(value))
    .replace(',', '')
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(query)
    const sync = () => {
      setMatches(mediaQuery.matches)
    }

    sync()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', sync)
      return () => {
        mediaQuery.removeEventListener('change', sync)
      }
    }

    mediaQuery.addListener(sync)
    return () => {
      mediaQuery.removeListener(sync)
    }
  }, [query])

  return matches
}

function buildTeacherBoards(currentPlan: PlanResponse, cachedPlans: PlanResponse[]) {
  const sickSet = new Set(currentPlan.meta.sick_teachers.map((teacher) => teacher.trim().toUpperCase()))
  const boards = new Map<
    string,
    {
      label: string
      isSick: boolean
      blocks: Map<string, TeacherTrace>
      knownRooms: Set<string>
      knownClasses: Set<string>
      knownSubjects: Set<string>
    }
  >()

  function ensureBoard(teacher: string) {
    const normalizedTeacher = teacher.trim().toUpperCase()
    const existing = boards.get(normalizedTeacher)
    if (existing) {
      existing.isSick = existing.isSick || sickSet.has(normalizedTeacher)
      return existing
    }

    const nextBoard = {
      label: normalizedTeacher,
      isSick: sickSet.has(normalizedTeacher),
      blocks: new Map<string, TeacherTrace>(),
      knownRooms: new Set<string>(),
      knownClasses: new Set<string>(),
      knownSubjects: new Set<string>(),
    }

    boards.set(normalizedTeacher, nextBoard)
    return nextBoard
  }

  function ingestPlan(sourcePlan: PlanResponse, includeCurrentBlocks: boolean) {
    for (const teacher of sourcePlan.meta.sick_teachers) {
      ensureBoard(teacher)
    }

    for (const entity of sourcePlan.entities) {
      const entityBlocks = buildLessonBlocks(entity.lessons)

      for (const block of entityBlocks) {
        const teachers = uniqueValues(block.teachers.map((teacher) => teacher.trim().toUpperCase()))
        if (!teachers.length) {
          continue
        }

        const classLabels = uniqueValues(block.classes.length ? block.classes : [entity.label])
        const roomLabels = uniqueValues(block.rooms)

        for (const teacher of teachers) {
          const board = ensureBoard(teacher)

          for (const classLabel of classLabels) {
            board.knownClasses.add(classLabel)
          }
          for (const roomLabel of roomLabels) {
            board.knownRooms.add(roomLabel)
          }
          if (block.subject) {
            board.knownSubjects.add(block.subject)
          }

          if (!includeCurrentBlocks) {
            continue
          }

          const traceKey = [
            block.startPeriod,
            block.endPeriod,
            block.startTime ?? '',
            block.endTime ?? '',
            block.subject ?? '',
            roomLabels.join('|'),
            block.info ?? '',
            block.status,
            block.is_changed ? '1' : '0',
            block.is_cancelled ? '1' : '0',
          ].join('::')

          const existingTrace = board.blocks.get(traceKey)

          if (existingTrace) {
            existingTrace.classes = uniqueValues([...existingTrace.classes, ...classLabels])
          } else {
            board.blocks.set(traceKey, {
              id: `${teacher}-${block.id}`,
              startPeriod: block.startPeriod,
              endPeriod: block.endPeriod,
              startTime: block.startTime,
              endTime: block.endTime,
              subject: block.subject,
              rooms: roomLabels,
              classes: classLabels,
              info: block.info,
              status: block.status,
              is_changed: block.is_changed,
              is_cancelled: block.is_cancelled,
            })
          }
        }
      }
    }
  }

  for (const teacher of sickSet) {
    ensureBoard(teacher)
  }

  ingestPlan(currentPlan, true)

  for (const cachedPlan of cachedPlans) {
    if (cachedPlan.meta.requested_date === currentPlan.meta.requested_date) {
      continue
    }

    ingestPlan(cachedPlan, false)
  }

  return [...boards.entries()]
    .map(([id, board]) => {
      const blocks = [...board.blocks.values()].sort((left, right) => {
        if (left.startPeriod !== right.startPeriod) {
          return left.startPeriod - right.startPeriod
        }

        return (left.subject ?? '').localeCompare(right.subject ?? '', 'de-DE')
      })

      return {
        id,
        label: board.label,
        blocks,
        rooms: uniqueValues(blocks.flatMap((block) => block.rooms)),
        classes: uniqueValues(blocks.flatMap((block) => block.classes)),
        subjects: uniqueValues(blocks.map((block) => block.subject ?? '').filter(Boolean)),
        knownRooms: uniqueValues([...board.knownRooms]),
        knownClasses: uniqueValues([...board.knownClasses]),
        knownSubjects: uniqueValues([...board.knownSubjects]),
        blockCount: blocks.length,
        changedCount: blocks.filter((block) => block.is_changed).length,
        cancelledCount: blocks.filter((block) => block.is_cancelled).length,
        firstStart: blocks[0]?.startTime ?? null,
        lastEnd: blocks[blocks.length - 1]?.endTime ?? null,
        isSick: board.isSick,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'de-DE'))
}

function teacherMatchesQuery(board: TeacherBoard, normalizedSearch: string) {
  if (!normalizedSearch) {
    return true
  }

  const haystack = [
    board.label,
    ...board.knownRooms,
    ...board.knownClasses,
    ...board.knownSubjects,
    ...board.rooms,
    ...board.classes,
    ...board.subjects,
    ...board.blocks.map((block) => block.info ?? ''),
  ]
    .join(' ')
    .toLowerCase()

  return haystack.includes(normalizedSearch)
}

function resolveEntityForPlan(plan: PlanResponse | null, selectedEntityId?: string, selectedEntityLabel?: string) {
  if (!plan || (!selectedEntityId && !selectedEntityLabel)) {
    return null
  }

  return (
    plan.entities.find((entity) => entity.id === selectedEntityId) ??
    plan.entities.find((entity) => entity.label === selectedEntityLabel) ??
    null
  )
}

function buildWeeklyDays(
  currentPlan: PlanResponse,
  cachedPlans: PlanResponse[],
  selectedEntityId?: string,
  selectedEntityLabel?: string,
) {
  const weekDates = buildDateStrip(currentPlan.meta.requested_date, new Set(currentPlan.meta.free_days))
  const plansByDate = new Map<string, PlanResponse>()

  for (const cachedPlan of cachedPlans) {
    plansByDate.set(cachedPlan.meta.requested_date, cachedPlan)
  }

  plansByDate.set(currentPlan.meta.requested_date, currentPlan)

  return weekDates.map<WeeklyDay>((date) => {
    const dayPlan = plansByDate.get(date) ?? null
    const entity = resolveEntityForPlan(dayPlan, selectedEntityId, selectedEntityLabel)
    const slots = entity ? buildScheduleSlots(buildLessonBlocks(entity.lessons)) : []

    return {
      date,
      plan: dayPlan,
      entity,
      slots,
      isCurrent: date === currentPlan.meta.requested_date,
      isFreeDay: (dayPlan?.meta.free_days ?? currentPlan.meta.free_days).includes(date),
    }
  })
}

function buildWeeklyEntityChoices(currentPlan: PlanResponse, cachedPlans: PlanResponse[], normalizedSearch: string) {
  const weekDates = new Set(buildDateStrip(currentPlan.meta.requested_date, new Set(currentPlan.meta.free_days)))
  const entities = new Map<
    string,
    {
      id: string
      label: string
      slotCount: number
      changedCount: number
      cancelledCount: number
      days: Set<string>
    }
  >()

  for (const sourcePlan of [currentPlan, ...cachedPlans]) {
    if (!weekDates.has(sourcePlan.meta.requested_date)) {
      continue
    }

    for (const entity of sourcePlan.entities) {
      if (normalizedSearch && !matchesQuery(entity, normalizedSearch)) {
        continue
      }

      const key = entity.label.trim().toUpperCase()
      const existing = entities.get(key)
      const slots = buildScheduleSlots(buildLessonBlocks(entity.lessons))

      if (existing) {
        existing.slotCount += slots.length
        existing.changedCount += entity.stats.changed_count
        existing.cancelledCount += entity.stats.cancelled_count
        existing.days.add(sourcePlan.meta.requested_date)
        continue
      }

      entities.set(key, {
        id: entity.id,
        label: entity.label,
        slotCount: slots.length,
        changedCount: entity.stats.changed_count,
        cancelledCount: entity.stats.cancelled_count,
        days: new Set([sourcePlan.meta.requested_date]),
      })
    }
  }

  return [...entities.values()]
    .map<WeeklyEntityChoice>((entity) => ({
      id: entity.id,
      label: entity.label,
      slotCount: entity.slotCount,
      changedCount: entity.changedCount,
      cancelledCount: entity.cancelledCount,
      dayCount: entity.days.size,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'de-DE'))
}

function toMinutes(value: string | null) {
  if (!value || !value.includes(':')) {
    return null
  }

  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null
  }

  return hours * 60 + minutes
}

function currentClockMinutes() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function slotIncludesMinutes(slot: { startTime: string | null; endTime: string | null }, minutes: number) {
  const start = toMinutes(slot.startTime)
  const end = toMinutes(slot.endTime)

  if (start === null || end === null) {
    return false
  }

  return minutes >= start && minutes < end
}

function buildGlobalDaySlots(plan: PlanResponse) {
  const allBlocks = plan.entities.flatMap((entity) => buildLessonBlocks(entity.lessons))
  return buildScheduleSlots(allBlocks)
}

function buildRoomTimelineRows(room: RoomBoard | undefined, daySlots: ScheduleSlot[]) {
  if (!room) {
    return []
  }

  const slotMap = new Map(room.slots.map((slot) => [slot.id, slot]))

  return daySlots.map<RoomTimelineRow>((daySlot) => ({
    id: daySlot.id,
    startPeriod: daySlot.startPeriod,
    endPeriod: daySlot.endPeriod,
    startTime: daySlot.startTime,
    endTime: daySlot.endTime,
    slot: slotMap.get(daySlot.id) ?? null,
  }))
}

function buildRoomBoards(currentPlan: PlanResponse, cachedPlans: PlanResponse[]) {
  const weekDates = new Set(buildDateStrip(currentPlan.meta.requested_date, new Set(currentPlan.meta.free_days)))
  const knownRooms = new Set<string>()
  const occupiedByRoom = new Map<string, LessonBlock[]>()
  const currentMinutes = currentClockMinutes()

  for (const sourcePlan of [currentPlan, ...cachedPlans]) {
    if (!weekDates.has(sourcePlan.meta.requested_date)) {
      continue
    }

    for (const entity of sourcePlan.entities) {
      for (const block of buildLessonBlocks(entity.lessons)) {
        for (const room of uniqueValues(block.rooms)) {
          knownRooms.add(room)

          if (sourcePlan.meta.requested_date !== currentPlan.meta.requested_date) {
            continue
          }

          const roomBlocks = occupiedByRoom.get(room) ?? []
          roomBlocks.push(block)
          occupiedByRoom.set(room, roomBlocks)
        }
      }
    }
  }

  return [...knownRooms]
    .map<RoomBoard>((room) => {
      const slots = buildScheduleSlots(occupiedByRoom.get(room) ?? [])
      const currentSlot = slots.find((slot) => slotIncludesMinutes(slot, currentMinutes)) ?? null
      const nextSlot =
        slots.find((slot) => {
          const slotStart = toMinutes(slot.startTime)
          return slotStart !== null && slotStart > currentMinutes
        }) ?? null
      const activeBlocks = currentSlot?.blocks ?? []
      const classes = uniqueValues(slots.flatMap((slot) => slot.blocks.flatMap((block) => block.classes)))
      const teachers = uniqueValues(slots.flatMap((slot) => slot.blocks.flatMap((block) => block.teachers)))
      const subjects = uniqueValues(slots.flatMap((slot) => slot.blocks.map((block) => block.subject ?? '').filter(Boolean)))

      return {
        id: room,
        label: room,
        slots,
        classes,
        teachers,
        subjects,
        currentClasses: uniqueValues(activeBlocks.flatMap((block) => block.classes)),
        currentTeachers: uniqueValues(activeBlocks.flatMap((block) => block.teachers)),
        currentSubjects: uniqueValues(activeBlocks.map((block) => block.subject ?? '').filter(Boolean)),
        slotCount: slots.length,
        changedCount: slots.filter((slot) => slot.blocks.some((block) => block.is_changed)).length,
        cancelledCount: slots.filter((slot) => slot.blocks.every((block) => block.is_cancelled)).length,
        isOccupiedNow: Boolean(currentSlot),
        currentSlot,
        nextSlot,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'de-DE'))
}

function buildWeeklyMatrixRows(days: WeeklyDay[]): WeeklyMatrixRow[] {
  const rows = new Map<
    string,
    {
      slot: ScheduleSlot
      cells: Map<string, ScheduleSlot | null>
    }
  >()

  for (const day of days) {
    for (const slot of day.slots) {
      const key = [slot.startPeriod, slot.endPeriod, slot.startTime ?? '', slot.endTime ?? ''].join('::')
      const existing = rows.get(key)

      if (existing) {
        existing.cells.set(day.date, slot)
        continue
      }

      rows.set(key, {
        slot,
        cells: new Map([[day.date, slot]]),
      })
    }
  }

  return [...rows.values()]
    .sort((left, right) => {
      if (left.slot.startPeriod !== right.slot.startPeriod) {
        return left.slot.startPeriod - right.slot.startPeriod
      }

      return (left.slot.startTime ?? '').localeCompare(right.slot.startTime ?? '', 'de-DE')
    })
    .map<WeeklyMatrixRow>((row) => ({
      id: row.slot.id,
      label: blockPeriodLabel(row.slot),
      time: blockTimeLabel(row.slot),
      cells: days.map((day) => ({
        day,
        slot: row.cells.get(day.date) ?? null,
      })),
    }))
}

function teacherStatusRank(teacher: TeacherBoard) {
  if (teacher.isSick) {
    return 3
  }

  if (teacher.changedCount + teacher.cancelledCount > 0) {
    return 2
  }

  if (teacher.blockCount > 0) {
    return 1
  }

  return 0
}

function SectionHeading({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="section-eyebrow">{subtitle}</p>
        <h2>{title}</h2>
      </div>
      {actions ? <div className="section-heading__actions">{actions}</div> : null}
    </div>
  )
}

function DateStrip({
  currentDate,
  freeDays,
  isRefreshing,
  lastRefreshAt,
  usingCachedPlan,
  onDateChange,
}: {
  currentDate: string
  freeDays: string[]
  isRefreshing: boolean
  lastRefreshAt: string | null
  usingCachedPlan: boolean
  onDateChange: (date: string) => Promise<void>
}) {
  const freeDaySet = new Set(freeDays)
  const visibleDates = buildDateStrip(currentDate, freeDaySet)
  const previousWeek = moveCalendarWeeks(currentDate, -1)
  const nextWeek = moveCalendarWeeks(currentDate, 1)

  return (
    <div className={isRefreshing ? 'workspace-datebar is-refreshing' : 'workspace-datebar'}>
      <div className="date-strip">
        <button
          type="button"
          className="date-strip__nav"
          onClick={() => void onDateChange(previousWeek)}
          aria-label="Vorherige Schulwoche"
        >
          <ChevronLeft />
        </button>

        <div className="date-strip__days">
          {visibleDates.map((date) => {
            const isActive = date === currentDate
            const isFree = freeDaySet.has(date)

            return (
              <button
                key={date}
                type="button"
                className={['date-strip__day', isActive ? 'is-active' : '', isFree ? 'is-free' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => void onDateChange(date)}
              >
                <span className="date-strip__day-label">{formatDateChip(date)}</span>
                {isFree ? <span className="date-strip__day-note">frei</span> : null}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="date-strip__nav"
          onClick={() => void onDateChange(nextWeek)}
          aria-label="Nächste Schulwoche"
        >
          <ChevronRight />
        </button>
      </div>

      <label className="date-strip__picker">
        <span className="field-label">Datum</span>
        <input
          type="date"
          value={currentDate}
          onChange={(event) => void onDateChange(event.target.value)}
        />
        <span className="date-strip__stamp">
          {usingCachedPlan ? 'Offline-Kopie' : 'Zuletzt aktualisiert'} · {formatDateTime(lastRefreshAt)}
        </span>
      </label>

    </div>
  )
}

function ScheduleTable({ slots }: { slots: ScheduleSlot[] }) {
  if (!slots.length) {
    return <p className="empty-copy">Keine Blöcke in dieser Auswahl.</p>
  }

  return (
    <div className="schedule-table">
      <div className="schedule-table__head">
        <span>Block</span>
        <span>Zeit</span>
        <span>Plan</span>
        <span>Status</span>
      </div>

      <div className="schedule-table__body">
        {slots.map((slot) => (
          <article key={slot.id} className={scheduleRowClass(slot)}>
            <div className="schedule-cell schedule-cell--period">
              <strong>{blockPeriodLabel(slot)}</strong>
            </div>
            <div className="schedule-cell schedule-cell--time">
              <strong>{slot.startTime ?? '--:--'}</strong>
              <span>{slot.endTime ?? '--:--'}</span>
            </div>
            <div className="schedule-cell schedule-cell--details">
              <div className="schedule-slot-list">
                {slot.blocks.map((block) => (
                  <div key={block.id} className="schedule-slot-item">
                    <div className="schedule-slot-item__head">
                      <strong>{block.subject ?? 'Entfall'}</strong>
                      <span>
                        {joinOrFallback(block.teachers, 'Kein Lehrer')} · {joinOrFallback(block.rooms, 'Kein Raum')}
                      </span>
                    </div>
                    <p>{block.info ?? 'Ohne Zusatzhinweis'}</p>
                  </div>
                ))}
              </div>
            </div>
            <span className={scheduleSlotStatusClass(slot)}>{scheduleSlotStatusLabel(slot)}</span>
          </article>
        ))}
      </div>
    </div>
  )
}

function CompactWeekDay({ day }: { day: WeeklyDay }) {
  const additionalPlanInfo = day.plan?.meta.additional_info?.trim()
  const headline = formatLongDate(day.date)
  const subtitle = day.isFreeDay ? 'Freier Tag' : day.slots.length ? `${day.slots.length} Blöcke` : 'Kein Eintrag'

  return (
    <div className="week-compact">
      <article
        className={[
          'week-day-head',
          'week-day-head--compact',
          day.isCurrent ? 'is-active' : '',
          day.isFreeDay ? 'week-day-head--free' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <strong>{headline}</strong>
        <span>{subtitle}</span>
      </article>

      {day.isFreeDay ? (
        <article className="week-compact__free">
          <div className="week-cell__free-copy">
            <strong>Freier Tag</strong>
            <span>Für den ausgewählten Tag gibt es keine Blöcke.</span>
          </div>
        </article>
      ) : day.slots.length ? (
        <ScheduleTable slots={day.slots} />
      ) : (
        <div className="empty-state">
          <strong>Für diesen Tag liegt kein sichtbarer Plan vor.</strong>
          <p>Wechsle oben das Datum oder öffne eine andere Klasse derselben Woche.</p>
        </div>
      )}

      {additionalPlanInfo ? (
        <article className="schedule-extra-info">
          <div className="schedule-extra-info__head">
            <BookOpenText className="context-row__icon" />
            <strong>Zusatzinformationen</strong>
          </div>
          <p>{additionalPlanInfo}</p>
        </article>
      ) : null}
    </div>
  )
}

function WeekTable({ days, compact = false }: { days: WeeklyDay[]; compact?: boolean }) {
  if (!days.length) {
    return <p className="empty-copy">Keine Wochendaten vorhanden.</p>
  }

  if (compact) {
    const currentDay = days.find((day) => day.isCurrent) ?? days[0]
    return <CompactWeekDay day={currentDay} />
  }

  const rows = buildWeeklyMatrixRows(days)
  const visibleRows =
    rows.length > 0
      ? rows
      : [
          {
            id: 'week-status',
            label: 'Status',
            time: 'Diese Woche',
            cells: days.map((day) => ({
              day,
              slot: null,
            })),
          },
        ]

  return (
    <div className="week-table">
      <div className="week-table__grid">
        <div className="week-table__corner">
          <strong>Block</strong>
          <span>Zeitfenster</span>
        </div>
        {days.map((day) => (
          <div
            key={day.date}
            className={[
              'week-day-head',
              day.isCurrent ? 'is-active' : '',
              day.isFreeDay ? 'week-day-head--free' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <strong>{formatDateChip(day.date)}</strong>
            <span>
              {day.isFreeDay
                ? 'frei'
                : day.slots.length
                  ? `${day.slots.length} Blöcke`
                  : 'kein Eintrag'}
            </span>
          </div>
        ))}
        {visibleRows.map((row, rowIndex) => (
          <Fragment key={row.id}>
            <div className="week-row__meta">
              <strong>{row.label}</strong>
              <span>{row.time}</span>
            </div>

            {row.cells.map(({ day, slot }) => {
              if (!slot) {
                if (day.isFreeDay) {
                  if (rowIndex > 0) {
                    return null
                  }

                  return (
                    <div
                      key={`${row.id}-${day.date}`}
                      className="week-cell week-cell--free-column"
                      style={{ gridRow: `span ${visibleRows.length}` }}
                    >
                      <div className="week-cell__free-copy">
                        <strong>Freier Tag</strong>
                        <span>Keine Blöcke</span>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={`${row.id}-${day.date}`} className="week-cell week-cell--empty">
                    <span>Kein Block</span>
                  </div>
                )
              }

              return (
                <div key={`${row.id}-${day.date}`} className={scheduleRowClass(slot).replace('schedule-row', 'week-cell')}>
                  <div className="week-cell__body">
                    {slot.blocks.map((block) => (
                      <div key={block.id} className="week-cell__item">
                        <strong>{block.subject ?? 'Entfall'}</strong>
                        <span>{joinOrFallback(block.teachers, 'Kein Lehrer')}</span>
                        <span>{joinOrFallback(block.rooms, 'Kein Raum')}</span>
                        <p>{block.info ?? 'Ohne Zusatzhinweis'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function WeekChooser({
  entities,
  selectedLabel,
  weekSort,
  onSelectLabel,
  onWeekSortChange,
}: {
  entities: WeeklyEntityChoice[]
  selectedLabel: string
  weekSort: 'name' | 'blocks' | 'changes'
  onSelectLabel: (label: string) => void
  onWeekSortChange: (value: 'name' | 'blocks' | 'changes') => void
}) {
  return (
    <section className="sub-panel week-chooser">
      <div className="week-chooser__head">
        <div>
          <p className="section-eyebrow">Unterricht wählen</p>
          <h2>{selectedLabel || 'Klasse oder Kurs öffnen'}</h2>
        </div>
        <div className="week-chooser__controls">
          <label className="field-block week-chooser__sort">
            <span className="field-label">Sortierung</span>
            <select value={weekSort} onChange={(event) => onWeekSortChange(event.target.value as 'name' | 'blocks' | 'changes')}>
              <option value="name">Klasse oder Kurs</option>
              <option value="blocks">Blöcke zuerst</option>
              <option value="changes">Änderungen zuerst</option>
            </select>
          </label>
          <span className="sidebar-count">{entities.length}</span>
        </div>
      </div>
      {entities.length ? (
        <div className="directory-grid week-chooser__grid week-chooser__grid--uniform">
          {entities.map((entity) => (
            <button
              key={entity.label}
              type="button"
              className={entity.label === selectedLabel ? 'directory-card week-chooser-card is-active' : 'directory-card week-chooser-card'}
              onClick={() => onSelectLabel(entity.label)}
            >
              <div className="directory-card__header">
                <strong>{entity.label}</strong>
                <span>{entity.dayCount} Tage</span>
              </div>
              <div className="week-chooser-card__stats">
                <span>{entity.slotCount} Blöcke</span>
                <span>{entity.changedCount} Änderungen</span>
                <span>{entity.cancelledCount} Entfälle</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <strong>Keine Klasse zur Suche gefunden.</strong>
          <p>Lade einen anderen Tag derselben Woche oder prüfe, ob diese Woche bereits im Cache liegt.</p>
        </div>
      )}
    </section>
  )
}

function TeacherChooser({
  teachers,
  selectedTeacherId,
  search,
  teacherSort,
  onSearchChange,
  onTeacherSortChange,
  onSelectTeacher,
}: {
  teachers: TeacherBoard[]
  selectedTeacherId: string
  search: string
  teacherSort: 'status' | 'name' | 'changes'
  onSearchChange: (value: string) => void
  onTeacherSortChange: (value: 'status' | 'name' | 'changes') => void
  onSelectTeacher: (teacherId: string) => void
}) {
  const teachersWithChanges = teachers.filter((teacher) => teacher.changedCount + teacher.cancelledCount > 0).length
  const activeTeachers = teachers.filter((teacher) => teacher.blockCount > 0).length

  return (
    <div className="room-plan teacher-picker">
      <div className="room-plan__toolbar">
        <label className="field-block">
          <span className="field-label">Suche</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Lehrer, Raum, Klasse oder Fach"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Sortierung</span>
          <select value={teacherSort} onChange={(event) => onTeacherSortChange(event.target.value as 'status' | 'name' | 'changes')}>
            <option value="status">Status zuerst</option>
            <option value="name">Lehrerkürzel</option>
            <option value="changes">Änderungen zuerst</option>
          </select>
        </label>
      </div>

      <div className="room-plan__summary">
        <article className="metric-panel">
          <GraduationCap className="metric-panel__icon" />
          <div>
            <span>Sichtbare Lehrer</span>
            <strong>{teachers.length}</strong>
          </div>
        </article>
        <article className="metric-panel">
          <BellDot className="metric-panel__icon" />
          <div>
            <span>Mit Änderungen</span>
            <strong>{teachersWithChanges}</strong>
          </div>
        </article>
        <article className="metric-panel">
          <DoorClosed className="metric-panel__icon" />
          <div>
            <span>Ohne heutigen Block</span>
            <strong>{teachers.length - activeTeachers}</strong>
          </div>
        </article>
      </div>

      {teachers.length ? (
        <div className="room-plan__list room-plan__list--uniform teacher-picker__list">
          {teachers.map((teacher) => {
            const impactCount = teacher.changedCount + teacher.cancelledCount
            const isActive = teacher.id === selectedTeacherId
            const teacherRooms = teacher.rooms.length ? teacher.rooms : teacher.knownRooms
            const teacherClasses = teacher.classes.length ? teacher.classes : teacher.knownClasses
            const teacherSubjects = teacher.subjects.length ? teacher.subjects : teacher.knownSubjects

            return (
              <button
                key={teacher.id}
                type="button"
                className={[
                  'room-card',
                  'teacher-picker-card',
                  isActive ? 'is-active' : '',
                  teacher.isSick ? 'is-sick' : '',
                  impactCount ? 'is-alert' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectTeacher(teacher.id)}
              >
                <div className="room-card__head">
                  <div>
                    <strong>{teacher.label}</strong>
                    <span>{teacher.blockCount ? `${teacher.blockCount} Blöcke heute` : 'Heute kein Block'}</span>
                  </div>
                  <span
                    className={
                      teacher.isSick
                        ? 'status-badge status-badge--danger'
                        : impactCount
                          ? 'status-badge status-badge--warning'
                          : 'status-badge status-badge--success'
                    }
                  >
                    {teacher.isSick ? 'Krank' : impactCount ? 'Auffällig' : 'Unauffällig'}
                  </span>
                </div>

                <div className="room-card__live">
                  <strong>{teacher.blockCount ? 'Klassenkontakt sichtbar' : 'Nur indirekt sichtbar'}</strong>
                  <span>{joinOrFallback(teacherClasses.slice(0, 4), 'Keine Klassen')}</span>
                </div>

                <div className="room-card__meta">
                  <span>{joinOrFallback(teacherRooms.slice(0, 3), 'Keine Räume')}</span>
                  <span>{joinOrFallback(teacherSubjects.slice(0, 3), 'Keine Fächer')}</span>
                  <span>{impactCount ? `${impactCount} Änderungen` : 'Planmäßig'}</span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="empty-state teacher-directory__empty">
          <strong>Keine Lehrer zur Suche gefunden.</strong>
          <p>Die Suche filtert nur die Trefferliste und wählt keinen Lehrer automatisch aus.</p>
        </div>
      )}
    </div>
  )
}

function RoomChooser({
  rooms,
  selectedRoomId,
  roomSearch,
  roomSort,
  onSelectRoom,
  onRoomSearchChange,
  onRoomSortChange,
}: {
  rooms: RoomBoard[]
  selectedRoomId: string
  roomSearch: string
  roomSort: 'status' | 'name' | 'changes'
  onSelectRoom: (roomId: string) => void
  onRoomSearchChange: (value: string) => void
  onRoomSortChange: (value: 'status' | 'name' | 'changes') => void
}) {
  return (
    <div className="room-plan">
      <div className="room-plan__toolbar">
        <label className="field-block">
          <span className="field-label">Filter</span>
          <input
            value={roomSearch}
            onChange={(event) => onRoomSearchChange(event.target.value)}
            placeholder="Raum, Lehrer, Klasse oder Fach"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Sortierung</span>
          <select value={roomSort} onChange={(event) => onRoomSortChange(event.target.value as 'status' | 'name' | 'changes')}>
            <option value="status">Gerade belegt zuerst</option>
            <option value="name">Raumname</option>
            <option value="changes">Änderungen zuerst</option>
          </select>
        </label>
      </div>

      <div className="room-plan__summary">
        <article className="metric-panel">
          <MapPinned className="metric-panel__icon" />
          <div>
            <span>Gerade belegt</span>
            <strong>{rooms.filter((room) => room.isOccupiedNow).length}</strong>
          </div>
        </article>
        <article className="metric-panel">
          <DoorClosed className="metric-panel__icon" />
          <div>
            <span>Gerade frei</span>
            <strong>{rooms.filter((room) => !room.isOccupiedNow).length}</strong>
          </div>
        </article>
        <article className="metric-panel">
          <BellDot className="metric-panel__icon" />
          <div>
            <span>Mit Änderungen</span>
            <strong>{rooms.filter((room) => room.changedCount || room.cancelledCount).length}</strong>
          </div>
        </article>
      </div>

      {rooms.length ? (
        <div className="room-plan__list room-plan__list--uniform">
          {rooms.map((room) => {
            const isSelected = room.id === selectedRoomId
            const liveLabel = room.isOccupiedNow
              ? `Jetzt bis ${room.currentSlot?.endTime ?? '--:--'} belegt`
              : room.nextSlot
                ? `Nächster Block ${room.nextSlot.startTime ?? '--:--'}`
                : 'Heute frei'
            const livePeople = room.isOccupiedNow
              ? joinOrFallback(room.currentClasses, 'Keine Klasse')
              : joinOrFallback(room.classes.slice(0, 3), 'Kein heutiger Bezug')

            return (
              <button
                key={room.id}
                type="button"
                className={[
                  'room-card',
                  room.isOccupiedNow ? 'is-occupied' : 'is-free',
                  isSelected ? 'is-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onSelectRoom(room.id)}
              >
                <div className="room-card__head">
                  <div>
                    <strong>{room.label}</strong>
                    <span>{liveLabel}</span>
                  </div>
                  <span className={room.isOccupiedNow ? 'status-badge status-badge--warning' : 'status-badge status-badge--success'}>
                    {room.isOccupiedNow ? 'Belegt' : 'Frei'}
                  </span>
                </div>
                <div className="room-card__live">
                  <strong>{room.isOccupiedNow ? 'Gerade belegt' : 'Gerade frei'}</strong>
                  <span>{livePeople}</span>
                </div>
                <div className="room-card__meta">
                  <span>{joinOrFallback(room.teachers.slice(0, 3), 'Kein Lehrer')}</span>
                  <span>{joinOrFallback(room.subjects.slice(0, 3), 'Keine Fächer')}</span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="empty-copy">Keine Räume für diese Suche gefunden.</p>
      )}
    </div>
  )
}

function RoomDetail({
  room,
  daySlots,
}: {
  room?: RoomBoard
  daySlots: ScheduleSlot[]
}) {
  const selectedRoom = room
  const timelineRows = buildRoomTimelineRows(selectedRoom, daySlots)

  return (
    <section className="sub-panel room-plan__detail room-plan__detail--full">
      {selectedRoom ? (
        <div className="week-detail-toolbar week-detail-toolbar--compact">
          <div className="week-detail-toolbar__stats week-detail-toolbar__stats--start">
            <span className="token">{selectedRoom.slotCount} Blöcke</span>
            <span className="token">{selectedRoom.changedCount} Änderungen</span>
            <span className="token">{selectedRoom.cancelledCount} Entfälle</span>
            <span className="token">{selectedRoom.classes.length} Klassen</span>
          </div>
        </div>
      ) : null}

      <div className="room-plan__detail-shell">
        <SectionHeading
          title={selectedRoom ? `Raum ${selectedRoom.label}` : 'Raumdetail'}
          subtitle="Heute frei und belegt"
          actions={
            selectedRoom ? (
              <span className={selectedRoom.isOccupiedNow ? 'status-badge status-badge--warning' : 'status-badge status-badge--success'}>
                {selectedRoom.isOccupiedNow ? 'Gerade belegt' : 'Gerade frei'}
              </span>
            ) : null
          }
        />
        {selectedRoom ? (
          <div className="room-timeline">
            {timelineRows.map((row) => (
              <article key={row.id} className={row.slot ? scheduleRowClass(row.slot).replace('schedule-row', 'room-timeline__row') : 'room-timeline__row room-timeline__row--free'}>
                <div className="room-timeline__time">
                  <strong>{blockPeriodLabel(row)}</strong>
                  <span>{blockTimeLabel(row)}</span>
                </div>
                {row.slot ? (
                  <div className="room-timeline__content">
                    {row.slot.blocks.map((block) => (
                      <div key={block.id} className="room-timeline__item">
                        <strong>{joinOrFallback(block.classes, 'Keine Klasse')}</strong>
                        <span>
                          {(block.subject ?? 'Entfall')} · {joinOrFallback(block.teachers, 'Kein Lehrer')}
                        </span>
                        <p>{block.info ?? 'Ohne Zusatzhinweis'}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="room-timeline__content room-timeline__content--free">
                    <strong>Frei</strong>
                    <span>Kein Eintrag in diesem Zeitfenster.</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-copy">Kein Raum ausgewählt.</p>
        )}
      </div>
    </section>
  )
}
function TeacherTable({ teacher }: { teacher?: TeacherBoard }) {
  if (!teacher) {
    return <p className="empty-copy">Kein Lehrer ausgewählt.</p>
  }

  if (!teacher.blocks.length) {
    return (
      <div className="empty-state">
        <strong>Für {teacher.label} gibt es heute keine ableitbaren Klassenblöcke.</strong>
        <p>Das kann Freistunde, Ausfall oder eine reine Lehreransicht ohne Schülerbezug sein.</p>
      </div>
    )
  }

  return (
    <div className="teacher-table">
      <div className="teacher-table__body">
        {teacher.blocks.map((block) => (
          <article key={block.id} className="teacher-card teacher-card--compact">
            <div className="teacher-card__rail">
              <strong>{blockPeriodLabel(block)}</strong>
              <span>{blockTimeLabel(block)}</span>
            </div>

            <div className="teacher-card__content">
              <div className="teacher-card__headline">
                <div className="teacher-card__subject">
                  <strong>{block.subject ?? 'Entfall'}</strong>
                  <p>{block.info ?? 'Ohne Zusatzhinweis'}</p>
                </div>
                <span className={lessonStatusClass(block)}>{lessonStatusLabel(block)}</span>
              </div>

              <div className="teacher-card__meta">
                <div className="teacher-card__chip">
                  <span>Klasse</span>
                  <strong>{joinOrFallback(block.classes, 'Keine Klasse')}</strong>
                </div>

                <div className="teacher-card__chip">
                  <span>Raum</span>
                  <strong>{joinOrFallback(block.rooms, 'Kein Raum')}</strong>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function WorkspaceScreen({
  plan,
  cachedPlans,
  isNativeShell,
  form,
  settings,
  section,
  entitySearch,
  selectedEntityId,
  isLoading,
  isRefreshing,
  error,
  notice,
  lastRefreshAt,
  usingCachedPlan,
  onSectionChange,
  onEntitySearchChange,
  onSelectEntity,
  onRefresh,
  onDateChange,
  onOpenSetup,
  onLogout,
  onFormChange,
  onSettingsChange,
  onNotificationEntityChange,
  onSubmitSettings,
}: WorkspaceScreenProps) {
  const contentRef = useRef<HTMLElement | null>(null)
  const isCompactWeekLayout = useMediaQuery('(max-width: 1320px)')
  const [selectedTeacherId, setSelectedTeacherId] = useState('')
  const [teacherSearch, setTeacherSearch] = useState('')
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [roomSearch, setRoomSearch] = useState('')
  const [roomSort, setRoomSort] = useState<'status' | 'name' | 'changes'>('status')
  const [teacherSort, setTeacherSort] = useState<'status' | 'name' | 'changes'>('status')
  const [weekSort, setWeekSort] = useState<'name' | 'blocks' | 'changes'>('name')
  const [isWeekChooserOpen, setIsWeekChooserOpen] = useState(false)
  const [isRoomChooserOpen, setIsRoomChooserOpen] = useState(false)
  const [isTeacherChooserOpen, setIsTeacherChooserOpen] = useState(false)
  const deferredSearch = useDeferredValue(entitySearch)
  const deferredTeacherSearch = useDeferredValue(teacherSearch)
  const deferredRoomSearch = useDeferredValue(roomSearch)
  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const normalizedTeacherSearch = deferredTeacherSearch.trim().toLowerCase()
  const teacherBoards = useMemo(() => buildTeacherBoards(plan, cachedPlans), [cachedPlans, plan])
  const entityScheduleSlots = new Map<string, ScheduleSlot[]>(
    plan.entities.map((entity) => [entity.id, buildScheduleSlots(buildLessonBlocks(entity.lessons))]),
  )
  const entityPool = normalizedSearch ? plan.entities.filter((entity) => matchesQuery(entity, normalizedSearch)) : plan.entities
  const weekEntityPool = useMemo(() => buildWeeklyEntityChoices(plan, cachedPlans, ''), [cachedPlans, plan])
  const sortedWeekEntityPool = useMemo(() => {
    return [...weekEntityPool].sort((left, right) => {
      if (weekSort === 'changes') {
        const leftImpact = left.changedCount + left.cancelledCount
        const rightImpact = right.changedCount + right.cancelledCount
        if (leftImpact !== rightImpact) {
          return rightImpact - leftImpact
        }
      }

      if (weekSort === 'blocks') {
        if (left.slotCount !== right.slotCount) {
          return right.slotCount - left.slotCount
        }
      }

      return left.label.localeCompare(right.label, 'de-DE')
    })
  }, [weekEntityPool, weekSort])
  const selectedEntity =
    entityPool.find((entity) => entity.id === selectedEntityId) ??
    plan.entities.find((entity) => entity.id === selectedEntityId) ??
    entityPool[0] ??
    plan.entities[0]
  const selectedWeekEntity =
    weekEntityPool.find((entity) => entity.id === selectedEntityId) ??
    weekEntityPool.find((entity) => entity.label === selectedEntity?.label) ??
    weekEntityPool[0]
  const selectedEntityWeekLabel = selectedWeekEntity?.label ?? selectedEntity?.label ?? ''
  const selectedWeekStats = weekEntityPool.find((entity) => entity.label === selectedEntityWeekLabel) ?? null

  const selectedSlots = selectedEntity ? (entityScheduleSlots.get(selectedEntity.id) ?? []) : []
  const upcomingDays = upcomingFreeDays(plan.meta.free_days, plan.meta.requested_date)
  const firstBlock = selectedSlots[0]
  const lastBlock = selectedSlots[selectedSlots.length - 1]
  const weeklyDays = buildWeeklyDays(plan, cachedPlans, selectedEntityId, selectedEntityWeekLabel)
  const globalDaySlots = useMemo(() => buildGlobalDaySlots(plan), [plan])
  const roomBoards = buildRoomBoards(plan, cachedPlans)
  const normalizedRoomSearch = deferredRoomSearch.trim().toLowerCase()
  const filteredRoomBoards = (() => {
    const nextBoards = normalizedRoomSearch
      ? roomBoards.filter((room) =>
          [room.label, ...room.classes, ...room.teachers, ...room.subjects].join(' ').toLowerCase().includes(normalizedRoomSearch),
        )
      : roomBoards

    return [...nextBoards].sort((left, right) => {
      if (roomSort === 'changes') {
        const leftImpact = left.changedCount + left.cancelledCount
        const rightImpact = right.changedCount + right.cancelledCount
        if (leftImpact !== rightImpact) {
          return rightImpact - leftImpact
        }
      }

      if (roomSort === 'status') {
        if (left.isOccupiedNow !== right.isOccupiedNow) {
          return left.isOccupiedNow ? -1 : 1
        }
      }

      return left.label.localeCompare(right.label, 'de-DE')
    })
  })()
  const isEmptyPlan = plan.meta.total_entities === 0
  const isRequestedFreeDay = plan.meta.free_days.includes(plan.meta.requested_date)
  const teacherPool = useMemo(() => {
    const nextBoards = normalizedTeacherSearch
      ? teacherBoards.filter((teacher) => teacherMatchesQuery(teacher, normalizedTeacherSearch))
      : teacherBoards

    return [...nextBoards].sort((left, right) => {
      if (teacherSort === 'changes') {
        const leftImpact = left.changedCount + left.cancelledCount
        const rightImpact = right.changedCount + right.cancelledCount
        if (leftImpact !== rightImpact) {
          return rightImpact - leftImpact
        }
      }

      if (teacherSort === 'status') {
        const leftRank = teacherStatusRank(left)
        const rightRank = teacherStatusRank(right)
        if (leftRank !== rightRank) {
          return rightRank - leftRank
        }
      }

      if (left.blockCount !== right.blockCount) {
        return right.blockCount - left.blockCount
      }

      return left.label.localeCompare(right.label, 'de-DE')
    })
  }, [normalizedTeacherSearch, teacherBoards, teacherSort])
  const selectedTeacher = teacherBoards.find((teacher) => teacher.id === selectedTeacherId)
  const selectedRoom = roomBoards.find((room) => room.id === selectedRoomId)
  const emptyPlanTitle = isRequestedFreeDay ? `${formatLongDate(plan.meta.requested_date)} ist frei` : 'Kein Plan für dieses Datum'
  const additionalPlanInfo = plan.meta.additional_info?.trim() ? plan.meta.additional_info.trim() : null
  const emptyPlanCopy =
    plan.meta.additional_info ??
    'Für diesen Tag wurde kein Datensatz gefunden. Das ist häufig ein freier Tag, Ferien oder ein noch nicht veröffentlichter Stand.'
  const showDateStrip = section !== 'settings'
  const showEmptyPlan = isEmptyPlan && section !== 'settings' && section !== 'week'
  const teacherStatusLabel = selectedTeacher?.isSick ? 'Krank' : 'Aktiv'
  const teacherStatusCopy = selectedTeacher?.isSick
    ? 'In der Krankliste markiert. Sichtbare Bezüge können trotzdem aus älteren oder geänderten Klassenblöcken stammen.'
    : 'Sichtbar nur dort, wo Klassenblöcke den Lehrer im Schülerdatensatz referenzieren.'
  const teacherHasTodayBlocks = (selectedTeacher?.blockCount ?? 0) > 0
  const teacherRoomsLabel = teacherHasTodayBlocks ? 'Räume heute' : 'Bekannte Räume'
  const teacherClassesLabel = teacherHasTodayBlocks ? 'Klassen heute' : 'Bekannte Klassen'
  const teacherSubjectsLabel = teacherHasTodayBlocks ? 'Fächer heute' : 'Bekannte Fächer'
  const teacherRooms = teacherHasTodayBlocks ? selectedTeacher?.rooms ?? [] : selectedTeacher?.knownRooms ?? []
  const teacherClasses = teacherHasTodayBlocks ? selectedTeacher?.classes ?? [] : selectedTeacher?.knownClasses ?? []
  const teacherSubjects = teacherHasTodayBlocks ? selectedTeacher?.subjects ?? [] : selectedTeacher?.knownSubjects ?? []
  const teacherColumnClass =
    selectedTeacher && selectedTeacher.blocks.length
      ? 'content-columns teacher-columns'
      : 'content-columns teacher-columns teacher-columns--stacked'

  useEffect(() => {
    if (section !== 'week') {
      return
    }

    if (!selectedEntityWeekLabel) {
      setIsWeekChooserOpen(true)
    }
  }, [section, selectedEntityWeekLabel])

  useEffect(() => {
    if (section !== 'rooms') {
      return
    }

    if (!selectedRoom) {
      setIsRoomChooserOpen(true)
    }
  }, [section, selectedRoom])

  useEffect(() => {
    if (section !== 'teachers' || plan.meta.scope !== 'classes') {
      return
    }

    if (!selectedTeacher) {
      setIsTeacherChooserOpen(true)
    }
  }, [plan.meta.scope, section, selectedTeacher])

  const handleWeekEntitySelect = (label: string) => {
    const sameDayEntity = plan.entities.find((entity) => entity.label === label)
    const weekEntity = weekEntityPool.find((entity) => entity.label === label)
    const nextEntityId = sameDayEntity?.id ?? weekEntity?.id

    if (nextEntityId) {
      onSelectEntity(nextEntityId)
      setIsWeekChooserOpen(false)
    }
  }

  const handleRoomSelect = (roomId: string) => {
    setSelectedRoomId(roomId)
    setIsRoomChooserOpen(false)
  }

  const handleTeacherSelect = (teacherId: string) => {
    setSelectedTeacherId(teacherId)
    setIsTeacherChooserOpen(false)
  }

  return (
    <div className="workspace-screen">
      <aside className="nav-rail">
        <div className="nav-logo">VP</div>
        <div className="nav-stack">
          {workspaceSections.map((item) => {
            const Icon = sectionIcons[item.value]

            return (
              <button
                key={item.value}
                type="button"
                className={section === item.value ? 'nav-button is-active' : 'nav-button'}
                onClick={() => onSectionChange(item.value)}
                title={item.label}
              >
                <Icon className="nav-button__icon" />
                <span>{item.shortLabel}</span>
              </button>
            )
          })}
        </div>
        <div className="nav-tools">
          <button
            type="button"
            className="nav-tool-button"
            onClick={() => void onRefresh()}
            title="Aktualisieren"
          >
            <RefreshCw className={isRefreshing ? 'nav-tool-button__icon spin-icon' : 'nav-tool-button__icon'} />
          </button>
        </div>
        <div className="nav-rail__spacer" />
        <button type="button" className="nav-button nav-button--bottom" onClick={onLogout} title="Abmelden">
          <LogOut className="nav-button__icon" />
          <span>OUT</span>
        </button>
      </aside>

      <div className={section === 'settings' ? 'workspace-frame workspace-frame--settings' : 'workspace-frame'}>

        {showDateStrip ? (
          <DateStrip
            currentDate={plan.meta.requested_date}
            freeDays={plan.meta.free_days}
            isRefreshing={isRefreshing}
            lastRefreshAt={lastRefreshAt}
            usingCachedPlan={usingCachedPlan}
            onDateChange={onDateChange}
          />
        ) : null}

        <div className="workspace-body workspace-body--single">
          <main ref={contentRef} className="workspace-content workspace-content--single">
            {notice && section !== 'settings' ? <p className="message-banner message-banner--info">{notice}</p> : null}
            {error && section !== 'settings' ? <p className="message-banner message-banner--error">{error}</p> : null}

            {showEmptyPlan ? (
              <section className="content-panel content-panel--empty">
                <SectionHeading
                  title={emptyPlanTitle}
                  subtitle={isRequestedFreeDay ? 'Freier Tag' : 'Keine Daten'}
                  actions={<span className="panel-context">{formatShortDate(plan.meta.requested_date)}</span>}
                />

                <div className="empty-plan-layout">
                  <div className="empty-state empty-state--large">
                    <strong>Für diesen Tag gibt es keinen sichtbaren Plan.</strong>
                    <p>{emptyPlanCopy}</p>
                  </div>

                  <div className="context-stack">
                    <article className="context-card">
                      <div className="context-card__header">
                        <CalendarDays className="context-row__icon" />
                        <strong>Datum</strong>
                      </div>
                      <p>{formatLongDate(plan.meta.requested_date)}</p>
                    </article>

                    <article className="context-card">
                      <div className="context-card__header">
                        <BookOpenText className="context-row__icon" />
                        <strong>Abruf</strong>
                      </div>
                      <p>
                        {scopeLabel(plan.meta.scope)} · {form.server_domain}
                      </p>
                    </article>

                    <article className="context-card">
                      <div className="context-card__header">
                        <DoorClosed className="context-row__icon" />
                        <strong>Freie Tage</strong>
                      </div>
                      <p>
                        {upcomingDays.length
                          ? `${upcomingDays.length} kommende freie Tage hinterlegt.`
                          : 'Keine weiteren freien Tage hinterlegt.'}
                      </p>
                      {upcomingDays.length ? (
                        <div className="tag-list">
                          {upcomingDays.slice(0, 6).map((day) => (
                            <span key={day} className="token">
                              {formatShortDate(day)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  </div>
                </div>
              </section>
            ) : null}

            {!isEmptyPlan && section === 'schedule' ? (
              <section className="content-panel">
                <SectionHeading
                  title={selectedEntity ? `Stundenplan ${selectedEntity.label}` : 'Plan'}
                  subtitle="Tagesplan"
                />

                <div className="planner-shell">
                  <section className="sub-panel planner-selector">
                      <div className="planner-selector__head">
                        <div>
                          <p className="section-eyebrow">Auswahl</p>
                          <h2>{selectedEntity?.label ?? 'Kein Eintrag'}</h2>
                        </div>
                        <span className="sidebar-count">{entityPool.length}</span>
                      </div>

                      <label className="field-block">
                        <span className="field-label">Klasse oder Kurs suchen</span>
                        <input
                          value={entitySearch}
                          onChange={(event) => onEntitySearchChange(event.target.value)}
                          placeholder="Klasse, Lehrer, Raum oder Fach"
                        />
                      </label>

                      <label className="field-block">
                        <span className="field-label">Eintrag</span>
                        <select value={selectedEntity?.id ?? ''} onChange={(event) => onSelectEntity(event.target.value)}>
                          {entityPool.map((entity) => (
                            <option key={entity.id} value={entity.id}>
                              {entity.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="summary-grid">
                        <div className="summary-tile">
                          <span>Änderungen</span>
                          <strong>{selectedEntity?.stats.changed_count ?? 0}</strong>
                        </div>
                        <div className="summary-tile">
                          <span>Entfälle</span>
                          <strong>{selectedEntity?.stats.cancelled_count ?? 0}</strong>
                        </div>
                        <div className="summary-tile">
                          <span>Blöcke</span>
                          <strong>{selectedSlots.length}</strong>
                        </div>
                        <div className="summary-tile">
                          <span>Zeitfenster</span>
                          <strong>
                            {firstBlock?.startTime ?? '--:--'} - {lastBlock?.endTime ?? '--:--'}
                          </strong>
                        </div>
                      </div>
                    </section>

                  <section className="sub-panel planner-main">
                    <ScheduleTable slots={selectedSlots} />
                    {additionalPlanInfo ? (
                      <article className="schedule-extra-info">
                        <div className="schedule-extra-info__head">
                          <BookOpenText className="context-row__icon" />
                          <strong>Zusatzinformationen</strong>
                        </div>
                        <p>{additionalPlanInfo}</p>
                      </article>
                    ) : null}
                  </section>
                </div>
              </section>
            ) : null}

            {section === 'week' ? (
              <section className="content-panel content-panel--week">
                <SectionHeading
                  title={selectedEntityWeekLabel ? `Unterricht ${selectedEntityWeekLabel}` : 'Unterricht'}
                  subtitle="Montag bis Freitag"
                  actions={
                    !isWeekChooserOpen && selectedEntityWeekLabel ? (
                      <button type="button" className="button-secondary week-detail-back" onClick={() => setIsWeekChooserOpen(true)}>
                        <ChevronLeft className="button-icon" />
                        Klasse wechseln
                      </button>
                    ) : null
                  }
                />

                {isWeekChooserOpen || !selectedEntityWeekLabel ? (
                  <WeekChooser
                    entities={sortedWeekEntityPool}
                    selectedLabel={selectedEntityWeekLabel}
                    weekSort={weekSort}
                    onSelectLabel={handleWeekEntitySelect}
                    onWeekSortChange={setWeekSort}
                  />
                ) : (
                  <div className="week-detail-shell">
                    {selectedWeekStats ? (
                      <div className="week-detail-toolbar week-detail-toolbar--compact">
                        <div className="week-detail-toolbar__stats week-detail-toolbar__stats--start">
                          <span className="token">{selectedWeekStats.dayCount} Tage</span>
                          <span className="token">{selectedWeekStats.slotCount} Blöcke</span>
                          <span className="token">{selectedWeekStats.changedCount} Änderungen</span>
                          <span className="token">{selectedWeekStats.cancelledCount} Entfälle</span>
                        </div>
                      </div>
                    ) : null}

                    <section className="sub-panel planner-main planner-main--week">
                      {weeklyDays.some((day) => day.slots.length || day.isFreeDay) ? (
                        <WeekTable days={weeklyDays} compact={isCompactWeekLayout} />
                      ) : (
                        <div className="empty-state">
                          <strong>Für diese Woche liegt kein sichtbarer Plan vor.</strong>
                          <p>Öffne eine andere Klasse oder lade einen anderen Tag derselben Woche.</p>
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </section>
            ) : null}

            {!isEmptyPlan && section === 'rooms' ? (
              <section className="content-panel content-panel--rooms">
                <SectionHeading
                  title={selectedRoom && !isRoomChooserOpen ? `Raumplan ${selectedRoom.label}` : 'Raumplan'}
                  subtitle="Heute frei und belegt"
                  actions={
                    !isRoomChooserOpen && selectedRoom ? (
                      <button type="button" className="button-secondary week-detail-back" onClick={() => setIsRoomChooserOpen(true)}>
                        <ChevronLeft className="button-icon" />
                        Raum wechseln
                      </button>
                    ) : null
                  }
                />

                {isRoomChooserOpen || !selectedRoom ? (
                  <RoomChooser
                    rooms={filteredRoomBoards}
                    selectedRoomId={selectedRoomId}
                    roomSearch={roomSearch}
                    roomSort={roomSort}
                    onSelectRoom={handleRoomSelect}
                    onRoomSearchChange={setRoomSearch}
                    onRoomSortChange={setRoomSort}
                  />
                ) : (
                  <RoomDetail room={selectedRoom} daySlots={globalDaySlots} />
                )}
              </section>
            ) : null}

            {!isEmptyPlan && section === 'teachers' ? (
              <section className="content-panel content-panel--teachers">
                <SectionHeading
                  title={selectedTeacher && !isTeacherChooserOpen ? `Lehrerfinder ${selectedTeacher.label}` : 'Lehrerfinder'}
                  subtitle="Schülersicht"
                  actions={
                    <>
                      <span className="panel-context">So gut wie möglich aus Klassenblöcken abgeleitet</span>
                      {!isTeacherChooserOpen && selectedTeacher ? (
                        <button type="button" className="button-secondary week-detail-back" onClick={() => setIsTeacherChooserOpen(true)}>
                          <ChevronLeft className="button-icon" />
                          Lehrer wechseln
                        </button>
                      ) : null}
                    </>
                  }
                />

                {plan.meta.scope !== 'classes' ? (
                  <div className="empty-state">
                    <strong>Der Lehrerfinder braucht den Klassenplan als Datenbasis.</strong>
                    <p>Stelle im Setup den Abruf auf Klassen, damit Räume und Lehrerbewegungen abgeleitet werden können.</p>
                  </div>
                ) : isTeacherChooserOpen || !selectedTeacher ? (
                  <TeacherChooser
                    teachers={teacherPool}
                    selectedTeacherId={selectedTeacherId}
                    search={teacherSearch}
                    teacherSort={teacherSort}
                    onSearchChange={setTeacherSearch}
                    onTeacherSortChange={setTeacherSort}
                    onSelectTeacher={handleTeacherSelect}
                  />
                ) : (
                  <div className="teacher-detail-stack">
                    <div className="week-detail-toolbar week-detail-toolbar--compact">
                      <div className="week-detail-toolbar__stats week-detail-toolbar__stats--start">
                        <span className="token">{selectedTeacher.blockCount} Blöcke</span>
                        <span className="token">{selectedTeacher.rooms.length} Räume</span>
                        <span className="token">{selectedTeacher.classes.length} Klassen</span>
                        <span className="token">{selectedTeacher.changedCount + selectedTeacher.cancelledCount} Änderungen</span>
                      </div>
                    </div>

                    <div className="stats-grid teacher-metrics">
                      <article className="metric-panel">
                        <MapPinned className="metric-panel__icon" />
                        <div>
                          <span>Räume heute</span>
                          <strong>{selectedTeacher.rooms.length}</strong>
                        </div>
                      </article>
                      <article className="metric-panel">
                        <GraduationCap className="metric-panel__icon" />
                        <div>
                          <span>Klassenkontakt</span>
                          <strong>{selectedTeacher.classes.length}</strong>
                        </div>
                      </article>
                      <article className="metric-panel">
                        <BellDot className="metric-panel__icon" />
                        <div>
                          <span>Betroffene Blöcke</span>
                          <strong>{selectedTeacher.changedCount + selectedTeacher.cancelledCount}</strong>
                        </div>
                      </article>
                    </div>

                    <div className={teacherColumnClass}>
                      <section className="sub-panel">
                        <SectionHeading
                          title={`Wo ist ${selectedTeacher.label}?`}
                          subtitle="Abgeleitete Blöcke"
                        />
                        <TeacherTable teacher={selectedTeacher} />
                      </section>

                      <section className="sub-panel teacher-summary-panel">
                        <SectionHeading title="Einschätzung" subtitle="Zusammenfassung" />
                        <div className="stack-list">
                          <article className="list-row">
                            <div>
                              <strong>Status</strong>
                              <span>
                                {selectedTeacher.isSick
                                  ? 'In der Krankliste markiert. Termine können trotzdem als alte oder geänderte Klassenbezüge auftauchen.'
                                  : 'Nicht krank gemeldet. Sichtbar nur dort, wo Klassenblöcke den Lehrer referenzieren.'}
                              </span>
                            </div>
                            <span>{selectedTeacher.isSick ? 'Krank' : 'Aktiv'}</span>
                          </article>

                          <article className="list-row">
                            <div>
                              <strong>{teacherRoomsLabel}</strong>
                              <span>{joinOrFallback(teacherRooms, teacherHasTodayBlocks ? 'Keine Räume heute' : 'Keine Räume in geladenen Tagen')}</span>
                            </div>
                            <span>{teacherRooms.length}</span>
                          </article>

                          <article className="list-row">
                            <div>
                              <strong>{teacherClassesLabel}</strong>
                              <span>{joinOrFallback(teacherClasses, teacherHasTodayBlocks ? 'Keine Klassen heute' : 'Keine Klassen in geladenen Tagen')}</span>
                            </div>
                            <span>{teacherClasses.length}</span>
                          </article>

                          <article className="list-row">
                            <div>
                              <strong>{teacherSubjectsLabel}</strong>
                              <span>{joinOrFallback(teacherSubjects, teacherHasTodayBlocks ? 'Keine Fächer heute' : 'Keine Fächer in geladenen Tagen')}</span>
                            </div>
                            <span>{teacherSubjects.length}</span>
                          </article>
                        </div>

                        <div className="teacher-summary-grid">
                          <article className="teacher-summary-card teacher-summary-card--wide">
                            <div className="teacher-summary-card__head">
                              <strong>Status</strong>
                              <span className={selectedTeacher.isSick ? 'status-badge status-badge--danger' : 'status-badge status-badge--success'}>
                                {teacherStatusLabel}
                              </span>
                            </div>
                            <p>{teacherStatusCopy}</p>
                          </article>

                          <article className="teacher-summary-card">
                            <div className="teacher-summary-card__head">
                              <strong>{teacherRoomsLabel}</strong>
                              <span>{teacherRooms.length}</span>
                            </div>
                            <div className="teacher-summary-card__tokens">
                              {(teacherRooms.length ? teacherRooms : [teacherHasTodayBlocks ? 'Keine Räume heute' : 'Keine Räume in geladenen Tagen']).map((room) => (
                                <span key={room} className="token">
                                  {room}
                                </span>
                              ))}
                            </div>
                          </article>

                          <article className="teacher-summary-card">
                            <div className="teacher-summary-card__head">
                              <strong>{teacherClassesLabel}</strong>
                              <span>{teacherClasses.length}</span>
                            </div>
                            <div className="teacher-summary-card__tokens">
                              {(teacherClasses.length ? teacherClasses : [teacherHasTodayBlocks ? 'Keine Klassen heute' : 'Keine Klassen in geladenen Tagen']).map((classLabel) => (
                                <span key={classLabel} className="token">
                                  {classLabel}
                                </span>
                              ))}
                            </div>
                          </article>

                          <article className="teacher-summary-card">
                            <div className="teacher-summary-card__head">
                              <strong>{teacherSubjectsLabel}</strong>
                              <span>{teacherSubjects.length}</span>
                            </div>
                            <div className="teacher-summary-card__tokens">
                              {(teacherSubjects.length ? teacherSubjects : [teacherHasTodayBlocks ? 'Keine Fächer heute' : 'Keine Fächer in geladenen Tagen']).map((subject) => (
                                <span key={subject} className="token">
                                  {subject}
                                </span>
                              ))}
                            </div>
                          </article>
                        </div>

                        <p className="inference-note">
                          Dieser Bereich ist kein echter Lehrerplan. Er rekonstruiert die wahrscheinliche Lehrerposition aus
                          allen sichtbaren Klassenblöcken und ist deshalb bei Freistunden, Aufsichten oder verborgenen
                          Lehreransichten nur eine Annäherung.
                        </p>
                      </section>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {section === 'settings' ? (
              <section className="content-panel content-panel--settings">
                <SectionHeading
                  title="App-Einstellungen"
                  subtitle={isNativeShell ? 'Verbindung, Darstellung und Verhalten' : 'Verbindung, Darstellung und Benachrichtigungen'}
                />
                <div className="settings-page-grid">
                  <form
                    className="sub-panel settings-surface settings-surface--primary settings-form settings-form--surface"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void onSubmitSettings()
                    }}
                  >
                    <div className="settings-block__header">
                      <p className="section-eyebrow">Verbindung</p>
                      <h3>Schule und Abruf</h3>
                    </div>

                    <ConnectionFields dense form={form} onFormChange={onFormChange} />

                    <div className="settings-actions">
                      <button type="submit" className="button-primary" disabled={isLoading}>
                        {isLoading ? 'Lädt …' : 'Neu verbinden'}
                      </button>
                      <button type="button" className="button-secondary" onClick={onOpenSetup}>
                        Zur Anmeldemaske
                      </button>
                    </div>
                  </form>

                  <section className="sub-panel settings-surface settings-surface--theme">
                    <div className="settings-block__header">
                      <p className="section-eyebrow">Darstellung</p>
                      <h3>Theme</h3>
                    </div>
                    <div className="segment-control settings-segment-control">
                      {themeModeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={settings.theme_mode === option.value ? 'segment-button is-active' : 'segment-button'}
                          onClick={() => onSettingsChange('theme_mode', option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="sub-panel settings-surface settings-surface--refresh">
                    <div className="settings-block__header">
                      <p className="section-eyebrow">Hintergrund</p>
                      <h3>{isNativeShell ? 'Refresh und Tray' : 'Automatisierung'}</h3>
                    </div>

                    <div className="field-block">
                      <span className="field-label">Refresh-Intervall (Minuten)</span>
                      <input
                        inputMode="numeric"
                        value={settings.refresh_interval_minutes}
                        onChange={(event) => onSettingsChange('refresh_interval_minutes', event.target.value)}
                        placeholder="15"
                      />
                      <small className="field-note">
                        {isNativeShell
                          ? 'Läuft auch weiter, wenn die App nur im Systemtray verborgen ist.'
                          : 'Aktualisiert den Plan automatisch, solange dieser Browser-Tab geöffnet bleibt.'}
                      </small>
                    </div>

                    {isNativeShell ? (
                      <>
                        <label className="toggle-row">
                          <div>
                            <strong>Mit System starten</strong>
                            <span>Beim Systemstart automatisch im Tray laden.</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.autostart_enabled}
                            onChange={(event) => onSettingsChange('autostart_enabled', event.target.checked)}
                          />
                        </label>

                        <label className="toggle-row">
                          <div>
                            <strong>Beim Schließen in den Tray</strong>
                            <span>Fenster schließen blendet die App aus, statt sie zu beenden.</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={settings.close_to_tray}
                            onChange={(event) => onSettingsChange('close_to_tray', event.target.checked)}
                          />
                        </label>
                      </>
                    ) : null}

                    <div className="settings-meta">
                      <Clock3 className="settings-meta__icon" />
                      <div>
                        <strong>Zuletzt erfolgreich aktualisiert</strong>
                        <span>{formatDateTime(lastRefreshAt)}</span>
                      </div>
                    </div>
                  </section>

                  <section className="sub-panel settings-surface settings-surface--notifications">
                    <div className="settings-block__header">
                      <p className="section-eyebrow">Benachrichtigungen</p>
                      <h3>Planänderungen</h3>
                    </div>

                    <label className="toggle-row">
                      <div>
                        <strong>Desktop-Benachrichtigungen</strong>
                        <span>Nur auslösen, wenn sich dein Zielplan wirklich geändert hat.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.notifications_enabled}
                        onChange={(event) => onSettingsChange('notifications_enabled', event.target.checked)}
                      />
                    </label>

                    <label className="field-block">
                      <span className="field-label">Benachrichtigungs-Klasse</span>
                      <select
                        value={settings.notification_entity_id || selectedEntity?.id || ''}
                        onChange={(event) => onNotificationEntityChange(event.target.value)}
                        disabled={!plan.entities.length}
                      >
                        {plan.entities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.label}
                          </option>
                        ))}
                      </select>
                      <small className="field-note">
                        So bleibt die Meldung auf deinen eigenen Plan beschränkt.
                      </small>
                    </label>

                    <div className="settings-meta">
                      <BellDot className="settings-meta__icon" />
                      <div>
                        <strong>Aktueller Zielplan</strong>
                        <span>
                          {plan.entities.find((entity) => entity.id === (settings.notification_entity_id || selectedEntity?.id))
                            ?.label ?? 'Noch keine Klasse gewählt'}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}

