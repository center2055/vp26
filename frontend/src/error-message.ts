export function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n\n${error.stack}` : error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unbekannter Fehler.'
}

// Tauri reicht Fehler als String oder als Objekt durch. Ein blankes String(value)
// macht aus dem Objektfall "[object Object]" - das stand so in der Oberflaecke.
export function toErrorMessage(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) {
    return value.message
  }

  if (typeof value === 'string' && value.trim()) {
    return value
  }

  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; error?: unknown; detail?: unknown }
    for (const entry of [candidate.message, candidate.error, candidate.detail]) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry
      }
    }

    try {
      const serialised = JSON.stringify(value)
      if (serialised && serialised !== '{}') {
        return `${fallback} (${serialised.slice(0, 200)})`
      }
    } catch {
      // zirkulaere Struktur: dann bleibt es beim Fallback
    }
  }

  return fallback
}
