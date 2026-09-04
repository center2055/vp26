import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  ChevronRight,
  Clock,
  GraduationCap,
  RefreshCw,
  Search,
  TrendingDown,
  UserX,
  X,
} from 'lucide-react'
import { fetchTeacherAnalytics, fetchTeacherHistory } from '../api'
import type {
  TeacherAnalyticsEntry,
  TeacherAnalyticsResponse,
  TeacherDayHistoryEntry,
} from '../types'
import { formatLongDate, formatShortDate } from '../ui'

type AnalyticsSectionProps = {
  apiBaseUrl: string
}

type SortKey = 'sick' | 'cancelled' | 'changed' | 'rate' | 'name'

export function AnalyticsSection({ apiBaseUrl }: AnalyticsSectionProps) {
  const [data, setData] = useState<TeacherAnalyticsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [daysRange, setDaysRange] = useState<number>(30)
  const [sortBy, setSortBy] = useState<SortKey>('sick')
  const [search, setSearch] = useState('')

  const [activeTeacher, setActiveTeacher] = useState<TeacherAnalyticsEntry | null>(null)
  const [history, setHistory] = useState<TeacherDayHistoryEntry[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  async function loadAnalytics(days: number) {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetchTeacherAnalytics(apiBaseUrl, { days })
      setData(response)
    } catch (err: any) {
      setError(err?.message || 'Statistiken konnten nicht geladen werden.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadAnalytics(daysRange)
  }, [apiBaseUrl, daysRange])

  async function handleOpenTeacherHistory(teacher: TeacherAnalyticsEntry) {
    setActiveTeacher(teacher)
    setIsLoadingHistory(true)
    try {
      const records = await fetchTeacherHistory(apiBaseUrl, teacher.id)
      setHistory(records)
    } catch {
      setHistory([])
    } finally {
      setIsLoadingHistory(false)
    }
  }

  function handleCloseModal() {
    setActiveTeacher(null)
    setHistory([])
  }

  const normalizedSearch = search.trim().toLowerCase()

  const filteredAndSortedTeachers = useMemo(() => {
    if (!data) return []

    let list = data.teachers
    if (normalizedSearch) {
      list = list.filter(
        (t) =>
          t.label.toLowerCase().includes(normalizedSearch) ||
          t.subjects.some((s) => s.toLowerCase().includes(normalizedSearch)) ||
          t.classes.some((c) => c.toLowerCase().includes(normalizedSearch)),
      )
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'sick') {
        if (b.days_sick !== a.days_sick) return b.days_sick - a.days_sick
        return b.cancelled_blocks - a.cancelled_blocks
      }
      if (sortBy === 'cancelled') {
        if (b.cancelled_blocks !== a.cancelled_blocks) return b.cancelled_blocks - a.cancelled_blocks
        return b.days_sick - a.days_sick
      }
      if (sortBy === 'changed') {
        if (b.changed_blocks !== a.changed_blocks) return b.changed_blocks - a.changed_blocks
        return b.days_sick - a.days_sick
      }
      if (sortBy === 'rate') {
        if (b.cancellation_rate !== a.cancellation_rate) return b.cancellation_rate - a.cancellation_rate
        return b.days_sick - a.days_sick
      }
      return a.label.localeCompare(b.label, 'de-DE')
    })
  }, [data, normalizedSearch, sortBy])

  const maxSickDays = useMemo(() => {
    if (!data?.teachers.length) return 1
    return Math.max(...data.teachers.map((t) => t.days_sick), 1)
  }, [data])

  const summary = data?.summary

  return (
    <div className=analytics-view>
      <div className=section-heading>
        <div>
          <p className=section-eyebrow>Langzeit-Auswertung</p>
          <h2>Lehrer- & Ausfallstatistik</h2>
        </div>
        <div className=section-heading__actions>
          <button
            type=button
            className=button-secondary
            onClick={() => void loadAnalytics(daysRange)}
            disabled={isLoading}
            title=Aktualisieren
          >
            <RefreshCw className={isLoading ? 'button-icon spin-icon' : 'button-icon'} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      {summary ? (
        <div className=stats-grid analytics-metrics>
          <article className=metric-panel>
            <Calendar className=metric-panel__icon />
            <div>
              <span>Erfasste Schultage</span>
              <strong>{summary.tracked_days} Tage</strong>
            </div>
          </article>

          <article className=metric-panel>
            <UserX className=metric-panel__icon />
            <div>
              <span>Krankheits-Ereignisse</span>
              <strong style={{ color: summary.total_sick_events ? 'var(--color-danger, #ef4444)' : 'inherit' }}>
                {summary.total_sick_events} Tage
              </strong>
            </div>
          </article>

          <article className=metric-panel>
            <AlertTriangle className=metric-panel__icon />
            <div>
              <span>Entfallene Stunden</span>
              <strong>{summary.total_cancelled_blocks} Blöcke</strong>
            </div>
          </article>

          <article className=metric-panel>
            <Activity className=metric-panel__icon />
            <div>
              <span>Geänderte Stunden</span>
              <strong>{summary.total_changed_blocks} Blöcke</strong>
            </div>
          </article>
        </div>
      ) : null}

      {/* Filter and Control Bar */}
      <div className=room-plan__toolbar analytics-toolbar>
        <label className=field-block analytics-search>
          <span className=field-label>Suche</span>
          <div className=field-input-wrapper>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder=Lehrer, Fach oder Klasse filtern...
            />
          </div>
        </label>

        <div className=analytics-toolbar__controls>
          <label className=field-block>
            <span className=field-label>Zeitraum</span>
            <select value={daysRange} onChange={(e) => setDaysRange(Number(e.target.value))}>
              <option value={7}>Letzte 7 Tage</option>
              <option value={30}>Letzte 30 Tage</option>
              <option value={90}>Letztes Quartal (90 Tage)</option>
              <option value={365}>Schuljahr (365 Tage)</option>
            </select>
          </label>

          <label className=field-block>
            <span className=field-label>Sortierung</span>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
              <option value=sick>Krankmeldungstage</option>
              <option value=cancelled>Entfallene Stunden</option>
              <option value=changed>Änderungsaufkommen</option>
              <option value=rate>Ausfallquote (%)</option>
              <option value=name>Kürzel / Name</option>
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <p className=message-banner message-banner--error>{error}</p>
      ) : null}

      {isLoading ? (
        <div className=empty-state>
          <RefreshCw className=spin-icon style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
          <strong>Statistiken werden berechnet...</strong>
        </div>
      ) : filteredAndSortedTeachers.length ? (
        <div className=analytics-list>
          {filteredAndSortedTeachers.map((teacher, index) => {
            const sickPercent = maxSickDays > 0 ? (teacher.days_sick / maxSickDays) * 100 : 0

            return (
              <article
                key={teacher.id}
                className={teacher.is_currently_sick ? 'analytics-card is-sick-today' : 'analytics-card'}
                onClick={() => void handleOpenTeacherHistory(teacher)}
                role=button
                tabIndex={0}
              >
                <div className=analytics-card__rank>
                  <span>#{index + 1}</span>
                </div>

                <div className=analytics-card__main>
                  <div className=analytics-card__header>
                    <div className=analytics-card__identity>
                      <strong>{teacher.label}</strong>
                      {teacher.is_currently_sick ? (
                        <span className=status-badge status-badge--danger>Heute Krank</span>
                      ) : teacher.days_sick > 0 ? (
                        <span className=status-badge status-badge--warning>{teacher.days_sick}x gefehlt</span>
                      ) : (
                        <span className=status-badge status-badge--success>0 Fehltage</span>
                      )}
                    </div>

                    <div className=analytics-card__metrics>
                      <div className=analytics-card__metric-item>
                        <span className=analytics-card__metric-label>Krank</span>
                        <strong className=analytics-card__metric-value style={{ color: teacher.days_sick ? 'var(--color-danger, #ef4444)' : 'inherit' }}>
                          {teacher.days_sick}d
                        </strong>
                      </div>
                      <div className=analytics-card__metric-item>
                        <span className=analytics-card__metric-label>Entfall</span>
                        <strong className=analytics-card__metric-value>{teacher.cancelled_blocks} Std</strong>
                      </div>
                      <div className=analytics-card__metric-item>
                        <span className=analytics-card__metric-label>Änderung</span>
                        <strong className=analytics-card__metric-value>{teacher.changed_blocks}</strong>
                      </div>
                      <div className=analytics-card__metric-item>
                        <span className=analytics-card__metric-label>Aktiv</span>
                        <strong className=analytics-card__metric-value>{teacher.days_with_blocks}d</strong>
                      </div>
                    </div>
                  </div>

                  {/* Relative Bar indicator */}
                  <div className=analytics-bar>
                    <div
                      className=analytics-bar__fill
                      style={{
                        width: ${Math.max(sickPercent, teacher.days_sick > 0 ? 8 : 0)}%,
                        backgroundColor: teacher.days_sick > 3 ? '#ef4444' : teacher.days_sick > 0 ? '#f59e0b' : '#10b981',
                      }}
                    />
                  </div>

                  <div className=analytics-card__footer>
                    <span>
                      {teacher.classes.length ? Klassen:  : 'Keine Klassen'}
                    </span>
                    <span>
                      {teacher.subjects.length ? Fächer:  : 'Keine Fächer'}
                    </span>
                    <span className=analytics-card__more>
                      Details & Historie <ChevronRight style={{ width: 14, height: 14, display: 'inline' }} />
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className=empty-state>
          <strong>Keine Daten für diesen Zeitraum vorhanden.</strong>
          <p>
            Sobald Pläne über die App oder den Hintergrunddienst abgerufen werden,
            speichert der Server die Tage automatisch in der Datenbank.
          </p>
        </div>
      )}

      {/* Teacher History Modal */}
      {activeTeacher ? (
        <div className=modal-backdrop onClick={handleCloseModal}>
          <div className=modal-dialog onClick={(e) => e.stopPropagation()}>
            <div className=modal-header>
              <div>
                <p className=section-eyebrow>Tagesverlauf</p>
                <h3>Lehrerhistorie: {activeTeacher.label}</h3>
              </div>
              <button type=button className=button-icon-only onClick={handleCloseModal} aria-label=Schließen>
                <X />
              </button>
            </div>

            <div className=modal-body>
              <div className=summary-grid style={{ marginBottom: 16 }}>
                <div className=summary-tile>
                  <span>Fehltage</span>
                  <strong>{activeTeacher.days_sick} Tage</strong>
                </div>
                <div className=summary-tile>
                  <span>Entfallene Std</span>
                  <strong>{activeTeacher.cancelled_blocks} Blöcke</strong>
                </div>
                <div className=summary-tile>
                  <span>Geänderte Std</span>
                  <strong>{activeTeacher.changed_blocks} Blöcke</strong>
                </div>
                <div className=summary-tile>
                  <span>Unterrichtstage</span>
                  <strong>{activeTeacher.days_with_blocks} Tage</strong>
                </div>
              </div>

              {isLoadingHistory ? (
                <div className=empty-state>
                  <RefreshCw className=spin-icon style={{ width: 24, height: 24, margin: '0 auto 8px' }} />
                  <p>Lade Historie...</p>
                </div>
              ) : history.length ? (
                <div className=history-timeline>
                  {history.map((item) => (
                    <article key={item.date} className={item.is_sick ? 'history-entry is-sick' : 'history-entry'}>
                      <div className=history-entry__date>
                        <strong>{formatShortDate(item.date)}</strong>
                        <span>{formatLongDate(item.date).split(',')[0]}</span>
                      </div>
                      <div className=history-entry__status>
                        {item.is_sick ? (
                          <span className=status-badge status-badge--danger>Krank</span>
                        ) : item.cancelled_blocks > 0 ? (
                          <span className=status-badge status-badge--warning>{item.cancelled_blocks} Ausfall</span>
                        ) : item.changed_blocks > 0 ? (
                          <span className=status-badge status-badge--warning>{item.changed_blocks} Geändert</span>
                        ) : item.total_blocks > 0 ? (
                          <span className=status-badge status-badge--success>{item.total_blocks} Blöcke regulär</span>
                        ) : (
                          <span className=status-badge>Kein Unterricht</span>
                        )}
                      </div>
                      <div className=history-entry__details>
                        {item.subjects.length ? <span>Fächer: {item.subjects.join(', ')}</span> : null}
                        {item.classes.length ? <span>Klassen: {item.classes.join(', ')}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className=empty-copy>Keine Detailtage für diesen Lehrer gefunden.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
