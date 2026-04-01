import type { FormState, FormUpdater } from '../ui'

type ConnectionFieldsProps = {
  form: FormState
  dense?: boolean
  showApiBaseField?: boolean
  onFormChange: FormUpdater
}

export function ConnectionFields({
  form,
  dense = false,
  showApiBaseField = true,
  onFormChange,
}: ConnectionFieldsProps) {
  return (
    <div className={dense ? 'connection-fields connection-fields--dense' : 'connection-fields'}>
      <div className={showApiBaseField ? 'field-grid' : 'field-grid field-grid--single'}>
        {showApiBaseField ? (
          <label className="field-block">
            <span className="field-label">API-Basis</span>
            <input
              value={form.api_base_url}
              onChange={(event) => onFormChange('api_base_url', event.target.value)}
              placeholder="/api"
            />
          </label>
        ) : null}
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
            value={form.port}
            onChange={(event) => onFormChange('port', event.target.value)}
            placeholder="optional"
          />
        </label>
      </div>

      <div className="field-grid">
        <label className="field-block">
          <span className="field-label">Schulnummer</span>
          <input
            inputMode="numeric"
            value={form.school_id}
            onChange={(event) => onFormChange('school_id', event.target.value)}
            placeholder="10001329"
          />
        </label>
        <label className="field-block">
          <span className="field-label">Benutzername</span>
          <input
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
          value={form.password}
          onChange={(event) => onFormChange('password', event.target.value)}
          placeholder="lokal gespeichert"
        />
        <small className="field-note">
          Wird lokal gespeichert, damit Login, Offline-Kopie und Benachrichtigungen ohne erneute Eingabe funktionieren.
        </small>
      </label>
    </div>
  )
}
