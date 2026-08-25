import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { fetchBootstrap, fetchPlan } from './api'
import {
  applyNativeTheme,
  initializeNativeShell,
  isNativeShell,
  loadNativeAutostartState,
  notifyPlanChange,
  resolveApiBase,
  syncNativeAutostart,
  syncNativeCloseToTray,
} from './native'
import { AuthScreen } from './components/auth-screen'
import { WorkspaceScreen } from './components/workspace-screen'
import type { BootstrapResponse, FetchPlanRequest, PlanResponse } from './types'
import {
  buildDateStrip,
  buildPlanCacheKey,
  clearStoredSession,
  createInitialAppSettings,
  createInitialFormState,
  FALLBACK_API_BASE_URL,
  formatDateTime,
  readCachedPlanForForm,
  readCachedPlansForForm,
  readLatestCachedPlan,
  resolveTheme,
  sanitizeRefreshInterval,
  writeCachedPlan,
  persistStoredState,
  type AppSettings,
  type FormState,
  type SettingsUpdater,
  type Theme,
  type WorkspaceSection,
} from './ui'
import './App.css'

type AppScreen = 'auth' | 'workspace'
type ConnectOptions = {
  preserveView?: boolean
  bootstrap?: boolean
  background?: boolean
  skipPrefetch?: boolean
}

type ApplyPlanOptions = ConnectOptions & {
  fromCache?: boolean
  cacheTimestamp?: string | null
  notice?: string | null
}

const BACKGROUND_TIMEOUT_MS = 20_000
const PREFETCH_TIMEOUT_MS = 15_000
const HAS_CONFIGURED_WEB_API_BASE = Boolean(import.meta.env.VITE_API_BASE_URL?.trim())

// Beim Start muss die Offline-Kopie zum Datum im Formular passen. Vorher wurde
// stumpf der zuletzt gespeicherte Tag gezeigt, während das Formular auf einem
// anderen Datum stand - ein Klick auf genau diesen Tag galt dann als "keine
// Änderung" und die Ansicht ließ sich nicht mehr dorthin bewegen.
function createStartupState() {
  const form = createInitialFormState()

  if (typeof window === 'undefined') {
    return { form, cachedPlan: null }
  }

  const cachedPlan = readCachedPlanForForm(form, true) ?? readLatestCachedPlan()

  return {
    form: cachedPlan ? { ...form, date: cachedPlan.requested_date } : form,
    cachedPlan,
  }
}

const startupState = createStartupState()
const initialCachedPlan = startupState.cachedPlan

let hasAttemptedBootstrap = false

function sanitizePayload(form: FormState, useBackendCredentials = false): FetchPlanRequest {
  // Hat das Backend eigene Zugangsdaten, gewinnen sie: sonst wuerde ein alter,
  // im Browser gespeicherter Login den funktionierenden Serverzugang ueberschreiben.
  const credentials = useBackendCredentials
    ? {}
    : {
        school_id: form.school_id ? Number(form.school_id) : undefined,
        username: form.username || undefined,
        password: form.password || undefined,
      }

  return {
    demo: false,
    scope: 'classes',
    date: form.date,
    ...credentials,
    server_domain: form.server_domain || 'stundenplan24.de',
    port: form.port ? Number(form.port) : undefined,
  }
}

function mergeBootstrapDefaults(form: FormState, bootstrap: BootstrapResponse): FormState {
  return {
    ...form,
    school_id: bootstrap.default_school_id ? String(bootstrap.default_school_id) : form.school_id,
    username: bootstrap.default_username ?? form.username,
    server_domain: bootstrap.default_server_domain || form.server_domain,
    port: bootstrap.default_port ? String(bootstrap.default_port) : form.port,
    scope: 'classes',
  }
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.message === 'Request cancelled')
  )
}

function buildNotificationSignature(plan: PlanResponse, entityId: string) {
  const entity = plan.entities.find((item) => item.id === entityId)
  if (!entity) {
    return null
  }

  return JSON.stringify(
    entity.lessons.map((lesson) => ({
      period: lesson.period,
      subject: lesson.subject,
      teachers: lesson.teachers,
      rooms: lesson.rooms,
      classes: lesson.classes,
      info: lesson.info,
      status: lesson.status,
      changed: lesson.is_changed,
      cancelled: lesson.is_cancelled,
    })),
  )
}

function buildNotificationCopy(plan: PlanResponse, entityId: string) {
  const entity = plan.entities.find((item) => item.id === entityId)
  if (!entity) {
    return null
  }

  const fragments: string[] = []
  if (entity.stats.changed_count) {
    fragments.push(`${entity.stats.changed_count} Änderungen`)
  }
  if (entity.stats.cancelled_count) {
    fragments.push(`${entity.stats.cancelled_count} Entfälle`)
  }
  if (!fragments.length) {
    fragments.push('Plan aktualisiert')
  }

  return {
    title: `VP26 · ${entity.label}`,
    body: `${fragments.join(' · ')} · Stand ${formatDateTime(plan.meta.fetched_at)}`,
  }
}

function App() {
  const nativeShell = isNativeShell()
  const [systemTheme, setSystemTheme] = useState<Theme>(() => resolveTheme('system'))
  const [backendHasCredentials, setBackendHasCredentials] = useState(false)
  const [screen, setScreen] = useState<AppScreen>(initialCachedPlan ? 'workspace' : 'auth')
  const [form, setForm] = useState<FormState>(() => startupState.form)
  const [settings, setSettings] = useState<AppSettings>(() => createInitialAppSettings())
  const [plan, setPlan] = useState<PlanResponse | null>(initialCachedPlan?.plan ?? null)
  const [section, setSection] = useState<WorkspaceSection>('week')
  const [entitySearch, setEntitySearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(initialCachedPlan?.cached_at ?? null)
  const [usingCachedPlan, setUsingCachedPlan] = useState(Boolean(initialCachedPlan))
  const [cacheRevision, setCacheRevision] = useState(0)
  const [cachedPlans, setCachedPlans] = useState<PlanResponse[]>(() => readCachedPlansForForm(startupState.form).map((entry) => entry.plan))
  const [hasCachedPlan, setHasCachedPlan] = useState(() => Boolean(readLatestCachedPlan()))
  const [, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(
    initialCachedPlan ? `Offline-Kopie geladen · Stand ${formatDateTime(initialCachedPlan.cached_at)}` : null,
  )

  const notificationSignatureRef = useRef<string | null>(
    initialCachedPlan ? buildNotificationSignature(initialCachedPlan.plan, settings.notification_entity_id || form.entity_id) : null,
  )
  const planRef = useRef<PlanResponse | null>(plan)
  const backendCredentialsRef = useRef(backendHasCredentials)
  const activeRequestIdRef = useRef(0)
  const activeRequestControllerRef = useRef<AbortController | null>(null)
  const prefetchingKeysRef = useRef<Set<string>>(new Set())
  const refreshRef = useRef<() => Promise<void>>(async () => undefined)
  const loadPlanRef = useRef<(nextForm: FormState, options?: ConnectOptions) => Promise<void>>(async () => undefined)
  const theme: Theme = useMemo(
    () => (settings.theme_mode === 'system' ? systemTheme : settings.theme_mode),
    [settings.theme_mode, systemTheme],
  )

  useEffect(() => {
    persistStoredState(form, settings)
  }, [form, settings])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    void applyNativeTheme(settings.theme_mode)
  }, [settings.theme_mode, theme])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleChange = () => {
      setSystemTheme(mediaQuery.matches ? 'light' : 'dark')
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }

    mediaQuery.addListener(handleChange)
    return () => {
      mediaQuery.removeListener(handleChange)
    }
  }, [])

  useEffect(() => {
    void loadNativeAutostartState().then((enabled) => {
      setSettings((current) => (current.autostart_enabled === enabled ? current : { ...current, autostart_enabled: enabled }))
    })
  }, [])

  useEffect(() => {
    if (!nativeShell || typeof window === 'undefined') {
      return
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    window.addEventListener('contextmenu', handleContextMenu)
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [nativeShell])

  useEffect(() => {
    void syncNativeAutostart(settings.autostart_enabled)
  }, [settings.autostart_enabled])

  useEffect(() => {
    void syncNativeCloseToTray(settings.close_to_tray)
  }, [settings.close_to_tray])

  useEffect(() => {
    setCachedPlans(readCachedPlansForForm(form).map((entry) => entry.plan))
    setHasCachedPlan(Boolean(readLatestCachedPlan()))
  }, [cacheRevision, form])

  useEffect(() => {
    refreshRef.current = async () => {
      await loadPlanRef.current(form, { preserveView: true, background: true })
    }
  })

  useEffect(() => {
    void initializeNativeShell({
      onRefresh: async () => refreshRef.current(),
    })
  }, [])

  useEffect(() => {
    return () => {
      activeRequestControllerRef.current?.abort()
    }
  }, [])

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const updateSettings: SettingsUpdater = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: key === 'refresh_interval_minutes' && typeof value === 'string' ? sanitizeRefreshInterval(value) : value,
    }))
  }

  function applyPlanData(data: PlanResponse, nextForm: FormState, options: ApplyPlanOptions = {}) {
    const activeEntityId =
      data.entities.find((entity) => entity.id === nextForm.entity_id)?.id ??
      data.meta.active_entity_id ??
      data.entities[0]?.id ??
      ''

    const notificationEntityId = settings.notification_entity_id || activeEntityId
    const nextSignature = buildNotificationSignature(data, notificationEntityId)
    const previousSignature = notificationSignatureRef.current

    if (
      !options.fromCache &&
      !options.bootstrap &&
      settings.notifications_enabled &&
      previousSignature &&
      nextSignature &&
      previousSignature !== nextSignature
    ) {
      const payload = buildNotificationCopy(data, notificationEntityId)
      if (payload) {
        void notifyPlanChange(payload.title, payload.body)
      }
    }

    notificationSignatureRef.current = nextSignature

    startTransition(() => {
        setPlan(data)
        setScreen('workspace')
        if (!options.preserveView) {
          setSection('week')
          setEntitySearch('')
        }
      setUsingCachedPlan(Boolean(options.fromCache))
      setLastRefreshAt(options.cacheTimestamp ?? data.meta.fetched_at ?? new Date().toISOString())
      setNotice(options.notice ?? null)
      setError(null)
      setForm((current) => ({
        ...current,
        ...nextForm,
        scope: 'classes',
        date: data.meta.requested_date || nextForm.date,
        entity_id: activeEntityId,
      }))
      setSettings((current) =>
        current.notification_entity_id || !activeEntityId
          ? current
          : {
              ...current,
              notification_entity_id: activeEntityId,
            },
      )
    })
  }

  function bumpCacheRevision() {
    setCacheRevision((current) => current + 1)
  }

  async function prefetchVisibleDates(baseForm: FormState, freeDays: string[]) {
    if (!baseForm.school_id || !baseForm.username || !baseForm.password) {
      return
    }

    const freeDaySet = new Set(freeDays)
    const prefetchDates = buildDateStrip(baseForm.date, freeDaySet).filter((date) => date !== baseForm.date)
    if (!prefetchDates.length) {
      return
    }

    let apiBase: string | null = null

    for (const date of prefetchDates) {
      const prefetchForm = {
        ...baseForm,
        date,
      }
      const cacheKey = buildPlanCacheKey(prefetchForm)

      if (prefetchingKeysRef.current.has(cacheKey) || readCachedPlanForForm(prefetchForm, true)) {
        continue
      }

      prefetchingKeysRef.current.add(cacheKey)

      try {
        apiBase ??= await resolveApiBase(prefetchForm.api_base_url)
        const data = await fetchPlan(apiBase, sanitizePayload(prefetchForm, backendCredentialsRef.current), {
          timeoutMs: PREFETCH_TIMEOUT_MS,
        })
        writeCachedPlan(prefetchForm, data)
        bumpCacheRevision()
      } catch {
        // ignore prefetch failures
      } finally {
        prefetchingKeysRef.current.delete(cacheKey)
      }
    }
  }

  async function loadPlan(nextForm: FormState, options: ConnectOptions = {}) {
    const isBackground = Boolean(options.background)
    const exactCached = readCachedPlanForForm(nextForm, true)
    const requestId = activeRequestIdRef.current + 1
    const controller = new AbortController()

    activeRequestIdRef.current = requestId
    activeRequestControllerRef.current?.abort()
    activeRequestControllerRef.current = controller

    if (isBackground) {
      setIsRefreshing(true)
      setError(null)
      setNotice(null)

      if (exactCached) {
        applyPlanData(exactCached.plan, nextForm, {
          ...options,
          fromCache: true,
          cacheTimestamp: exactCached.cached_at,
          notice: null,
        })
      }
    } else {
      setIsLoading(true)
      setError(null)
      setNotice(null)
    }

    try {
      const apiBase = await resolveApiBase(nextForm.api_base_url)
      if (controller.signal.aborted) {
        return
      }

      const data = await fetchPlan(apiBase, sanitizePayload(nextForm, backendCredentialsRef.current), {
        signal: controller.signal,
        timeoutMs: isBackground ? BACKGROUND_TIMEOUT_MS : undefined,
      })

      if (activeRequestIdRef.current !== requestId) {
        return
      }

      writeCachedPlan(nextForm, data)
      bumpCacheRevision()
      applyPlanData(data, nextForm, {
        ...options,
        notice: null,
      })

      if (!options.skipPrefetch) {
        void prefetchVisibleDates(
          {
            ...nextForm,
            date: data.meta.requested_date || nextForm.date,
          },
          data.meta.free_days,
        )
      }
    } catch (caught) {
      if (isAbortError(caught) || activeRequestIdRef.current !== requestId) {
        return
      }

      const message = caught instanceof Error ? caught.message : 'Verbindung konnte nicht aufgebaut werden.'
      const latestIdentityCache = readCachedPlanForForm(nextForm, false)
      const latestCache = readLatestCachedPlan()
      const fallbackCache = isBackground ? exactCached : exactCached ?? latestIdentityCache ?? latestCache

      if (fallbackCache) {
        applyPlanData(
          fallbackCache.plan,
          {
            ...nextForm,
            date: fallbackCache.requested_date,
          },
          {
            ...options,
            fromCache: true,
            cacheTimestamp: fallbackCache.cached_at,
            notice: `Offline-Kopie geladen · Stand ${formatDateTime(fallbackCache.cached_at)}`,
          },
        )
      } else {
        setError(message)
      }
    } finally {
      // Nur der jeweils jüngste Request räumt auf, dann aber beide Flags: bricht ein
      // Hintergrund-Refresh einen laufenden Vordergrund-Request ab, blieb "isLoading"
      // sonst dauerhaft stehen und die Oberfläche wirkte eingefroren.
      if (activeRequestIdRef.current === requestId) {
        activeRequestControllerRef.current = null
        setIsRefreshing(false)
        setIsLoading(false)
      }
    }
  }

  loadPlanRef.current = loadPlan
  planRef.current = plan
  backendCredentialsRef.current = backendHasCredentials

  useEffect(() => {
    if (hasAttemptedBootstrap) {
      return
    }

    hasAttemptedBootstrap = true

    async function bootstrap() {
      setIsBootstrapping(true)
      setError(null)

      // Ohne eingetragene API-Basis darf ein fehlgeschlagener Bootstrap keine
      // Fehlermeldung erzeugen - die Website soll dann einfach den Login zeigen.
      const isWebWithoutApiBase =
        !nativeShell && !HAS_CONFIGURED_WEB_API_BASE && startupState.form.api_base_url === FALLBACK_API_BASE_URL

      try {
        const initialForm = startupState.form
        const apiBase = await resolveApiBase(initialForm.api_base_url)
        const bootstrapData = await fetchBootstrap(apiBase)
        const nextForm = mergeBootstrapDefaults(initialForm, bootstrapData)

        setBackendHasCredentials(bootstrapData.has_backend_defaults)

        startTransition(() => {
          setForm((current) => ({
            ...current,
            ...nextForm,
            // Liefert das Backend die Zugangsdaten, wird der lokal gespeicherte
            // Login nicht mehr gebraucht und verschwindet auch aus dem Storage.
            ...(bootstrapData.has_backend_defaults ? { password: '' } : {}),
          }))
        })

        const canAutoConnect = Boolean(
          (nextForm.school_id && nextForm.username && nextForm.password) || bootstrapData.has_backend_defaults,
        )

        if (canAutoConnect) {
          await loadPlanRef.current(nextForm, {
            preserveView: Boolean(plan),
            bootstrap: true,
            background: Boolean(plan),
          })
        } else if (!plan) {
          setScreen('auth')
          setNotice('Zugangsdaten ergänzen und Plan laden.')
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Bootstrap konnte nicht geladen werden.'

        // Der Bootstrap läuft asynchron weiter, während bereits geklickt werden kann.
        // Ohne diese Prüfung warf sein Fehlerpfad den gerade geöffneten Tag wieder
        // auf die beim Start geladene Offline-Kopie zurück.
        const hasActivePlanRequest = activeRequestIdRef.current > 0

        if (isWebWithoutApiBase && !planRef.current && !hasActivePlanRequest) {
          setScreen('auth')
          setNotice(null)
          setError(null)
        } else if (initialCachedPlan && !planRef.current && !hasActivePlanRequest) {
          startTransition(() => {
            setPlan(initialCachedPlan.plan)
            setScreen('workspace')
            setUsingCachedPlan(true)
            setNotice(`Offline-Kopie geladen · Stand ${formatDateTime(initialCachedPlan.cached_at)}`)
            setLastRefreshAt(initialCachedPlan.cached_at)
          })
        } else if (!initialCachedPlan) {
          setError(message)
          setNotice(null)
        }
      } finally {
        setIsBootstrapping(false)
      }
    }

    void bootstrap()
  }, [nativeShell, plan])

  useEffect(() => {
    if (!plan) {
      return
    }

    const notificationEntityId = settings.notification_entity_id || form.entity_id
    notificationSignatureRef.current = buildNotificationSignature(plan, notificationEntityId)
  }, [form.entity_id, plan, settings.notification_entity_id])

  useEffect(() => {
    const refreshMinutes = Number(settings.refresh_interval_minutes)
    if (screen !== 'workspace' || !plan || !refreshMinutes || refreshMinutes <= 0) {
      return
    }

    const timer = window.setInterval(() => {
      void loadPlanRef.current(form, { preserveView: true, background: true })
    }, refreshMinutes * 60_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [form, plan, screen, settings.refresh_interval_minutes])

  async function handlePrimarySubmit() {
    await loadPlan(form)
  }

  async function handleRefresh() {
    await loadPlan(form, { preserveView: true, background: true })
  }

  async function handleDateChange(nextDate: string) {
    // Auch den angezeigten Plan prüfen: nach einem Offline-Start können Formular
    // und sichtbarer Tag auseinanderlaufen.
    if (nextDate === form.date && nextDate === plan?.meta.requested_date) {
      return
    }

    await loadPlan(
      {
        ...form,
        date: nextDate,
      },
      { preserveView: true, background: true },
    )
  }

  function handleOpenSetup() {
    setScreen('auth')
    setEntitySearch('')
  }

  function handleLogout() {
    clearStoredSession(settings)
    bumpCacheRevision()

    startTransition(() => {
      setPlan(null)
      setScreen('auth')
      setSection('week')
      setEntitySearch('')
      setUsingCachedPlan(false)
      setLastRefreshAt(null)
      setError(null)
      setNotice(null)
      setForm((current) => ({
        ...current,
        school_id: '',
        username: '',
        password: '',
        entity_id: '',
      }))
      setSettings((current) => ({
        ...current,
        notification_entity_id: '',
      }))
    })

    notificationSignatureRef.current = null
  }

  function handleSelectEntity(entityId: string) {
    updateForm('entity_id', entityId)
    setSettings((current) =>
      current.notification_entity_id
        ? current
        : {
            ...current,
            notification_entity_id: entityId,
          },
    )
  }

  function handleNotificationEntityChange(entityId: string) {
    updateSettings('notification_entity_id', entityId)
    if (plan) {
      notificationSignatureRef.current = buildNotificationSignature(plan, entityId)
    }
  }

  const shellClassName = [
    'vp26-shell',
    !nativeShell ? 'vp26-shell--web' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClassName}>
      <div className="vp26-shell__content">
        <div className="vp26-app">
          {screen === 'auth' || !plan ? (
            <AuthScreen
              form={form}
              isNativeShell={nativeShell}
              isLoading={isLoading || isBootstrapping}
              error={error}
              notice={notice}
              hasCachedPlan={hasCachedPlan}
              lastRefreshAt={lastRefreshAt}
              canReturnToPlan={screen === 'auth' && Boolean(plan)}
              backendHasCredentials={backendHasCredentials}
              onFormChange={updateForm}
              onSubmit={handlePrimarySubmit}
              onReturnToPlan={() => setScreen('workspace')}
            />
          ) : (
            <WorkspaceScreen
              plan={plan}
              cachedPlans={cachedPlans}
              isNativeShell={nativeShell}
              form={form}
              settings={settings}
              section={section}
              entitySearch={entitySearch}
              selectedEntityId={form.entity_id}
              isLoading={isLoading}
              isRefreshing={isRefreshing}
              error={error}
              notice={notice}
              lastRefreshAt={lastRefreshAt}
              usingCachedPlan={usingCachedPlan}
              onSectionChange={setSection}
              onEntitySearchChange={setEntitySearch}
              onSelectEntity={handleSelectEntity}
              onRefresh={handleRefresh}
              onDateChange={handleDateChange}
              onOpenSetup={handleOpenSetup}
              onLogout={handleLogout}
              onFormChange={updateForm}
              backendHasCredentials={backendHasCredentials}
              onSettingsChange={updateSettings}
              onNotificationEntityChange={handleNotificationEntityChange}
              onSubmitSettings={handlePrimarySubmit}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default App
