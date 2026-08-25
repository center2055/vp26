export function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n\n${error.stack}` : error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return 'Unbekannter Fehler.'
}
