import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FatalScreen } from './components/fatal-screen'
import { normalizeErrorMessage } from './error-message'

type RootErrorBoundaryProps = {
  children: ReactNode
}

type RootErrorBoundaryState = {
  error: Error | null
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('VP26 React render failed.', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return <FatalScreen title="Die Oberfläche konnte nicht geladen werden." message={normalizeErrorMessage(this.state.error)} />
    }

    return this.props.children
  }
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root-Element #root wurde nicht gefunden.')
}

const root = createRoot(rootElement)

function hasRenderedApp() {
  return rootElement !== null && rootElement.childElementCount > 0
}

function reportError(scope: string, error: unknown) {
  console.error(`VP26 ${scope}`, error)

  // Sobald React etwas gerendert hat, übernimmt die Error-Boundary. Einzelne
  // fehlgeschlagene Hintergrundaufrufe dürfen die laufende Oberfläche nicht ersetzen.
  if (hasRenderedApp()) {
    return
  }

  root.render(<FatalScreen title="Die Oberfläche konnte nicht geladen werden." message={normalizeErrorMessage(error)} />)
}

window.addEventListener('error', (event) => {
  // Ladefehler einzelner Ressourcen (Bilder, Icons) melden sich ebenfalls hier,
  // haben aber ein Element als Ziel und sagen nichts über den Zustand der App aus.
  if (event.target && event.target !== window) {
    return
  }

  reportError('window error', event.error ?? new Error(event.message || 'Unbekannter Fensterfehler.'))
})

window.addEventListener('unhandledrejection', (event) => {
  reportError('unhandled rejection', event.reason instanceof Error ? event.reason : new Error(String(event.reason ?? 'Unbekannte Promise-Ablehnung.')))
})

try {
  root.render(
    <StrictMode>
      <RootErrorBoundary>
        <App />
      </RootErrorBoundary>
    </StrictMode>,
  )
} catch (error) {
  root.render(<FatalScreen title="Die Oberfläche konnte nicht geladen werden." message={normalizeErrorMessage(error)} />)
}
