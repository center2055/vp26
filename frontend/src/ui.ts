import type { PlanResponse, PlanScope } from './types'

export type WorkspaceSection = 'schedule' | 'week' | 'rooms' | 'teachers' | 'settings'
export type ScheduleSubsection = 'lessons' | 'week' | 'changes' | 'rooms' | 'courses' | 'extras'
export type Theme = 'dark' | 'light'
export type ThemeMode = 'system' | 'light' | 'dark'

export type FormState = {
  api_base_url: string
  school_id: string
  username: string
  password: string
  server_domain: string
  port: string
  scope: PlanScope
  date: string
  entity_id: string
}

export type AppSettings = {
  theme_mode: ThemeMode
  refresh_interval_minutes: string
  close_to_tray: boolean
  autostart_enabled: boolean
  notifications_enabled: boolean
  notification_entity_id: string
}

export type FormUpdater = <K extends keyof FormState>(key: K, value: FormState[K]) => void
export type SettingsUpdater = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void

type StoredState = Partial<FormState> &
  Partial<AppSettings> & {
    theme_mode?: ThemeMode
    settings_version?: number
  }

type CachePayload = {
  entries: CachedPlanState[]
}

type LegacyCachedPlanState = {
  plan: PlanResponse
  cached_at: string
}

export type CachedPlanState = {
  key: string
  identity: string
  requested_date: string
  plan: PlanResponse
  cached_at: string
}

export const STORAGE_KEY = 'vp26.preferences'
export const PLAN_CACHE_KEY = 'vp26.plan-cache'
export const CONFIGURED_WEB_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
export const FALLBACK_API_BASE_URL = CONFIGURED_WEB_API_BASE_URL || '/api'
const SETTINGS_STORAGE_VERSION = 3

const PLAN_CACHE_LIMIT = 45

export const DEFAULT_SETTINGS: AppSettings = {
  theme_mode: 'system',
  refresh_interval_minutes: '15',
  close_to_tray: false,
  autostart_enabled: false,
  notifications_enabled: false,
  notification_entity_id: '',
}

export const scopeOptions: Array<{ value: PlanScope; label: string; caption: string }> = [
  { value: 'classes', label: 'Klassen', caption: 'Schülerperspektive' },
  { value: 'teachers', label: 'Lehrer', caption: 'Vertretungen und Aufsichten' },
  { value: 'rooms', label: 'Räume', caption: 'Belegung und Wechsel' },
]

export const workspaceSections: Array<{ value: WorkspaceSection; label: string; shortLabel: string }> = [
  { value: 'week', label: 'Unterricht', shortLabel: 'UN' },
  { value: 'rooms', label: 'Raumplan', shortLabel: 'RA' },
  { value: 'teachers', label: 'Lehrerfinder', shortLabel: 'LF' },
  { value: 'settings', label: 'Einstellungen', shortLabel: 'SE' },
]

export const scheduleSections: Array<{ value: ScheduleSubsection; label: string }> = [
  { value: 'lessons', label: 'Stunden' },
  { value: 'week', label: 'Woche' },
  { value: 'changes', label: 'Änderungen' },
  { value: 'rooms', label: 'Räume' },
  { value: 'courses', label: 'Kurse' },
  { value: 'extras', label: 'Zusatz' },
]

export const themeModeOptions: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
]

function normalizeBaseUrl(apiBaseUrl: string) {
  return (apiBaseUrl.trim() || FALLBACK_API_BASE_URL).replace(/\/$/, '')
}

function buildLegacyCacheEntry(payload: LegacyCachedPlanState): CachedPlanState {
  const requestedDate = payload.plan.meta.requested_date || todayString()

  return {
    key: `legacy::${requestedDate}`,
    identity: 'legacy',
    requested_date: requestedDate,
    plan: payload.plan,
    cached_at: payload.cached_at,
  }
}

function normalizeCacheEntries(entries: CachedPlanState[]) {
  const deduped = new Map<string, CachedPlanState>()

  for (const entry of entries) {
    if (!entry?.plan?.meta?.requested_date || !entry.cached_at) {
      continue
    }

    deduped.set(entry.key, entry)
  }

  return [...deduped.values()]
    .sort((left, right) => new Date(right.cached_at).getTime() - new Date(left.cached_at).getTime())
    .slice(0, PLAN_CACHE_LIMIT)
}

function readPlanCacheEntries() {
  try {
    const raw = window.localStorage.getItem(PLAN_CACHE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as CachePayload | LegacyCachedPlanState

    if (parsed && typeof parsed === 'object' && 'entries' in parsed && Array.isArray(parsed.entries)) {
      return normalizeCacheEntries(parsed.entries)
    }

    if (parsed && typeof parsed === 'object' && 'plan' in parsed && 'cached_at' in parsed) {
      return normalizeCacheEntries([buildLegacyCacheEntry(parsed as LegacyCachedPlanState)])
    }

    return []
  } catch {
    return []
  }
}

function writePlanCacheEntries(entries: CachedPlanState[]) {
  const payload: CachePayload = {
    entries: normalizeCacheEntries(entries),
  }

  window.localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(payload))
}

export function readStoredState(): StoredState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredState) : {}
  } catch {
    return {}
  }
}

export function buildPlanCacheIdentity(form: Pick<FormState, 'api_base_url' | 'school_id' | 'username' | 'server_domain' | 'port' | 'scope'>) {
  return [
    normalizeBaseUrl(form.api_base_url),
    form.scope,
    form.school_id.trim(),
    form.username.trim().toLowerCase(),
    (form.server_domain || 'stundenplan24.de').trim().toLowerCase(),
    form.port.trim(),
  ].join('::')
}

export function buildPlanCacheKey(form: Pick<FormState, 'api_base_url' | 'school_id' | 'username' | 'server_domain' | 'port' | 'scope' | 'date'>) {
  return `${buildPlanCacheIdentity(form)}::${form.date}`
}

export function readLatestCachedPlan(): CachedPlanState | null {
  return readPlanCacheEntries()[0] ?? null
}

export function readCachedPlan() {
  return readLatestCachedPlan()
}

export function readCachedPlanForForm(form: FormState, exactDate = true): CachedPlanState | null {
  const entries = readPlanCacheEntries()
  const identity = buildPlanCacheIdentity(form)

  if (exactDate) {
    return entries.find((entry) => entry.key === buildPlanCacheKey(form)) ?? null
  }

  return entries.find((entry) => entry.identity === identity) ?? null
}

export function readCachedPlansForForm(form: FormState) {
  const identity = buildPlanCacheIdentity(form)
  return readPlanCacheEntries().filter((entry) => entry.identity === identity)
}

export function writeCachedPlan(form: FormState, plan: PlanResponse) {
  const requestedDate = plan.meta.requested_date || form.date
  const cacheForm = {
    ...form,
    date: requestedDate,
  }

  const nextEntry: CachedPlanState = {
    key: buildPlanCacheKey(cacheForm),
    identity: buildPlanCacheIdentity(cacheForm),
    requested_date: requestedDate,
    plan,
    cached_at: new Date().toISOString(),
  }

  const entries = readPlanCacheEntries().filter((entry) => entry.key !== nextEntry.key)
  writePlanCacheEntries([nextEntry, ...entries])
}

export function persistStoredState(form: FormState, settings: AppSettings) {
  const stored: StoredState = {
    settings_version: SETTINGS_STORAGE_VERSION,
    api_base_url: form.api_base_url,
    school_id: form.school_id,
    username: form.username,
    password: form.password,
    server_domain: form.server_domain,
    port: form.port,
    scope: form.scope,
    date: form.date,
    entity_id: form.entity_id,
    theme_mode: settings.theme_mode,
    refresh_interval_minutes: settings.refresh_interval_minutes,
    close_to_tray: settings.close_to_tray,
    autostart_enabled: settings.autostart_enabled,
    notifications_enabled: settings.notifications_enabled,
    notification_entity_id: settings.notification_entity_id,
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export function clearStoredSession(settings: AppSettings) {
  const stored: StoredState = {
    settings_version: SETTINGS_STORAGE_VERSION,
    theme_mode: settings.theme_mode,
    refresh_interval_minutes: settings.refresh_interval_minutes,
    close_to_tray: settings.close_to_tray,
    autostart_enabled: settings.autostart_enabled,
    notifications_enabled: settings.notifications_enabled,
    notification_entity_id: '',
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  window.localStorage.removeItem(PLAN_CACHE_KEY)
}

export function todayString() {
  return new Date().toISOString().slice(0, 10)
}

export function createInitialFormState(): FormState {
  const stored = typeof window === 'undefined' ? {} : readStoredState()
  const today = todayString()
  const storedApiBaseUrl = stored.api_base_url?.trim()
  const initialApiBaseUrl =
    CONFIGURED_WEB_API_BASE_URL &&
    (!storedApiBaseUrl || storedApiBaseUrl === '/api' || storedApiBaseUrl === '/api/' || storedApiBaseUrl === 'api')
      ? CONFIGURED_WEB_API_BASE_URL
      : storedApiBaseUrl || FALLBACK_API_BASE_URL

  return {
    api_base_url: initialApiBaseUrl,
    school_id: stored.school_id ?? '',
    username: stored.username ?? '',
    password: stored.password ?? '',
    server_domain: stored.server_domain ?? 'stundenplan24.de',
    port: stored.port ?? '',
    scope: stored.scope ?? 'classes',
    date: stored.date && stored.date >= today ? stored.date : today,
    entity_id: stored.entity_id ?? '',
  }
}

export function createInitialAppSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS
  }

  const stored = readStoredState()
  const hasCurrentSettingsSchema = stored.settings_version === SETTINGS_STORAGE_VERSION
  return {
    theme_mode:
      stored.theme_mode === 'light' || stored.theme_mode === 'dark' || stored.theme_mode === 'system'
        ? stored.theme_mode
        : DEFAULT_SETTINGS.theme_mode,
    refresh_interval_minutes: stored.refresh_interval_minutes ?? DEFAULT_SETTINGS.refresh_interval_minutes,
    close_to_tray: hasCurrentSettingsSchema ? stored.close_to_tray ?? DEFAULT_SETTINGS.close_to_tray : false,
    autostart_enabled: stored.autostart_enabled ?? DEFAULT_SETTINGS.autostart_enabled,
    notifications_enabled: stored.notifications_enabled ?? DEFAULT_SETTINGS.notifications_enabled,
    notification_entity_id: stored.notification_entity_id ?? DEFAULT_SETTINGS.notification_entity_id,
  }
}

export function resolveTheme(mode: ThemeMode): Theme {
  if (mode === 'light' || mode === 'dark') {
    return mode
  }

  if (typeof window === 'undefined') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0)
}

export function toLocalDateString(date: Date) {
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

function isWeekend(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

function startOfWeek(date: Date) {
  const next = new Date(date)
  const weekday = next.getDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  next.setDate(next.getDate() + diff)
  next.setHours(12, 0, 0, 0)
  return next
}

function isSchoolDay(date: Date, freeDaySet: Set<string>) {
  return !isWeekend(date) && !freeDaySet.has(toLocalDateString(date))
}

export function moveSchoolDay(currentDate: string, direction: -1 | 1, freeDaySet: Set<string>) {
  let cursor = parseLocalDate(currentDate)

  for (let index = 0; index < 21; index += 1) {
    cursor = shiftDays(cursor, direction)
    if (isSchoolDay(cursor, freeDaySet)) {
      return toLocalDateString(cursor)
    }
  }

  return currentDate
}

export function moveSchoolDays(currentDate: string, amount: number, freeDaySet: Set<string>) {
  if (amount === 0) {
    return currentDate
  }

  let nextDate = currentDate
  const direction = amount < 0 ? -1 : 1

  for (let index = 0; index < Math.abs(amount); index += 1) {
    nextDate = moveSchoolDay(nextDate, direction, freeDaySet)
  }

  return nextDate
}

export function moveCalendarWeeks(currentDate: string, amount: number) {
  if (amount === 0) {
    return currentDate
  }

  return toLocalDateString(shiftDays(parseLocalDate(currentDate), amount * 7))
}

export function buildDateStrip(currentDate: string, freeDaySet?: Set<string>) {
  void freeDaySet
  const weekStart = startOfWeek(parseLocalDate(currentDate))

  return Array.from({ length: 5 }, (_, index) => toLocalDateString(shiftDays(weekStart, index)))
}

export function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(parseLocalDate(value))
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parseLocalDate(value))
}

export function formatDateChip(value: string) {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  })
    .format(parseLocalDate(value))
    .replace(',', '')
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return 'Keine Veröffentlichung vorhanden'
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function scopeLabel(scope: PlanScope) {
  return scopeOptions.find((option) => option.value === scope)?.label ?? scope
}

export function sanitizeRefreshInterval(raw: string) {
  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0'
  }

  return String(Math.min(Math.round(numeric), 240))
}
