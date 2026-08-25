import { CONFIGURED_WEB_API_BASE_URL, type FormState, type FormUpdater } from '../ui'

type ConnectionFieldsProps = {
  form: FormState
  dense?: boolean
  defaultOpen?: boolean
  showCredentials?: boolean
  onFormChange: FormUpdater
}

export function ConnectionFields({
  form,
  dense = false,
  defaultOpen = true,
  showCredentials = true,
  onFormChange,
}: ConnectionFieldsProps) {
  const hasCustomConnection =
    Boolean(form.port.trim()) || (form.server_domain.trim() !== '' && form.server_domain.trim() !== 'stundenplan24.de')

  return (
    <div className={dense ? 'connection-fields connection-fields--dense' : 'connection-fields'}>
      {/* Bringt das Backend eigene Zugangsdaten mit, muss hier niemand etwas
          eintippen - die Felder sind dann nur noch Fallback. */}
      {showCredentials ? (
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
            <small className="field-note">
              Wird lokal gespeichert, damit Login, Offline-Kopie und Benachrichtigungen ohne erneute Eingabe funktionieren.
            </small>
          </label>
        </>
      ) : null}

      {/* Server, Port und Datum braucht fast niemand. Eingeklappt passt auf dem
          Handy die eigentliche Anmeldung samt Button auf einen Bildschirm. */}
      <details className="connection-advanced" open={defaultOpen || hasCustomConnection}>
        <summary>Verbindung anpassen</summary>

        <div className="connection-advanced__body">
          <div className="field-grid">
            {/* Immer erreichbar: ist das vorkonfigurierte Backend down, muss man
                auf ein anderes ausweichen koennen. */}
            <label className="field-block">
              <span className="field-label">API-Basis</span>
              <input
                value={form.api_base_url}
                onChange={(event) => onFormChange('api_base_url', event.target.value)}
                placeholder={CONFIGURED_WEB_API_BASE_URL || '/api'}
              />
              {CONFIGURED_WEB_API_BASE_URL ? (
                <small className="field-note">Vorgabe dieser Website: {CONFIGURED_WEB_API_BASE_URL}</small>
              ) : null}
            </label>
            <label className="field-block">
              <span className="field-label">Datum</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => onFormChange('date', event.target.value)}
              />
            </label>
          </div>

          <div className="field-grid">
            <label className="field-block">
              <span className="field-label">Serverdomain</span>
              <input
                value={form.server_domain}
                onChange={(event) => onFormChange('server_domain', event.target.value)}
                placeholder="stundenplan24.de"
              />
            </label>
            <label className="field-block">
              <span className="field-label">Port</span>
              <input
                inputMode="numeric"
                value={form.port}
                onChange={(event) => onFormChange('port', event.target.value)}
                placeholder="optional"
              />
            </label>
          </div>
        </div>
      </details>
    </div>
  )
}
