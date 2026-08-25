import type { FormEvent } from 'react'
import { ArrowRight, ChevronLeft, WifiOff } from 'lucide-react'
import { ConnectionFields } from './connection-fields'
import { CONFIGURED_WEB_API_BASE_URL, formatDateTime, type FormState, type FormUpdater } from '../ui'

type AuthScreenProps = {
  form: FormState
  isNativeShell: boolean
  isLoading: boolean
  error: string | null
  notice: string | null
  hasCachedPlan: boolean
  lastRefreshAt: string | null
  canReturnToPlan: boolean
  backendHasCredentials: boolean
  onFormChange: FormUpdater
  onSubmit: () => Promise<void>
  onReturnToPlan: () => void
}

export function AuthScreen({
  form,
  isNativeShell,
  isLoading,
  error,
  notice,
  hasCachedPlan,
  lastRefreshAt,
  canReturnToPlan,
  backendHasCredentials,
  onFormChange,
  onSubmit,
  onReturnToPlan,
}: AuthScreenProps) {
  const showConnectionFields = !isNativeShell
  const hasConfiguredWebApiBase = Boolean(CONFIGURED_WEB_API_BASE_URL)
  const showCredentials = !backendHasCredentials

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit()
  }

  return (
    <div className="auth-screen auth-screen--minimal">
      <section className="auth-panel auth-panel--full">
        <div className="panel-header panel-header--stacked">
          <div className="brand-badge">VP26</div>
          <div>
            <p className="eyebrow">Verbindung</p>
            <h2>Plan laden</h2>
            <p className="lead-text auth-lead">
              {backendHasCredentials
                ? 'Die Zugangsdaten liegen im Backend. Ein Klick genügt, um den aktuellen Plan zu laden.'
                : showConnectionFields
                  ? hasConfiguredWebApiBase
                    ? 'Die Website ist bereits mit dem VP26-Backend verbunden. Hier fehlen nur noch deine Zugangsdaten.'
                    : 'Im Web zuerst API-Basis und Zugangsdaten setzen. Tray, Autostart und andere App-Funktionen bleiben dort bewusst ausgeblendet.'
                  : 'Nur Schulnummer, Benutzername und Passwort. Darstellung, Benachrichtigungen und App-Verhalten stellst du später in den Einstellungen ein.'}
            </p>
          </div>
        </div>

        <form className="auth-form auth-form--minimal" onSubmit={handleSubmit}>
          {showConnectionFields ? (
            <ConnectionFields
              form={form}
              onFormChange={onFormChange}
              showCredentials={showCredentials}
              defaultOpen={(!hasConfiguredWebApiBase && showCredentials) || Boolean(error)}
            />
          ) : showCredentials ? (
            <>
              <div className="field-grid">
                <label className="field-block">
                  <span className="field-label">Schulnummer</span>
                  <input
                    inputMode="numeric"
                    autoComplete="username"
                    value={form.school_id}
                    onChange={(event) => onFormChange('school_id', event.target.value)}
                    placeholder="10001329"
                  />
                </label>
                <label className="field-block">
                  <span className="field-label">Benutzername</span>
                  <input
                    autoComplete="username"
                    value={form.username}
                    onChange={(event) => onFormChange('username', event.target.value)}
                    placeholder="schueler"
                  />
                </label>
              </div>

              <label className="field-block">
                <span className="field-label">Passwort</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => onFormChange('password', event.target.value)}
                  placeholder="lokal gespeichert"
                />
              </label>
            </>
          ) : null}

          {hasCachedPlan ? (
            <div className="auth-cache-note">
              <WifiOff className="auth-cache-note__icon" />
              <div>
                <strong>Offline-Kopie vorhanden</strong>
                <span>Letzter erfolgreicher Stand: {formatDateTime(lastRefreshAt)}</span>
              </div>
            </div>
          ) : null}

          {notice ? <p className="message-banner message-banner--info">{notice}</p> : null}
          {error ? <p className="message-banner message-banner--error">{error}</p> : null}
          {error && backendHasCredentials ? (
            <small className="field-note">
              Die Zugangsdaten stammen aus der Backend-Konfiguration (VP26_DEFAULT_SCHOOL_ID, VP26_DEFAULT_USERNAME,
              VP26_DEFAULT_PASSWORD) und lassen sich hier nicht ändern.
            </small>
          ) : null}

          <div className="auth-actions">
            <button type="submit" className="button-primary" disabled={isLoading}>
              <span>{isLoading ? 'Lade Plan ...' : 'Plan öffnen'}</span>
              <ArrowRight className="button-icon" />
            </button>
            {canReturnToPlan ? (
              <button type="button" className="button-secondary" onClick={onReturnToPlan}>
                <ChevronLeft className="button-icon" />
                Zurück zum Plan
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  )
}
