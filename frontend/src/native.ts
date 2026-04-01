import { setTheme } from '@tauri-apps/api/app'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from '@tauri-apps/plugin-autostart'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { Command } from '@tauri-apps/plugin-shell'
import type { ThemeMode } from './ui'

type NativeShellOptions = {
  onRefresh: () => Promise<void>
}

const DEFAULT_API_BASE = '/api'
const SIDECAR_NAME = 'binaries/vp26-backend'
const NATIVE_API_PORTS = [17826, 17827, 17828, 17829, 17830]
const SIDECAR_HEALTH_INTERVAL_MS = 500
const SIDECAR_HEALTH_ATTEMPTS = 50
const SIDECAR_HEALTH_TIMEOUT_MS = 1_200

let backendPromise: Promise<string> | null = null

type BackendLaunchState = {
  error: string | null
  close: { code: number | null; signal: number | null } | null
  stderr: string[]
  stdout: string[]
}

function normalizeBaseUrl(apiBaseUrl: string) {
  return (apiBaseUrl.trim() || DEFAULT_API_BASE).replace(/\/$/, '')
}

function buildNativeApiBaseUrl(port: number) {
  return `http://127.0.0.1:${port}/api`
}

async function pingHealth(base: string) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), SIDECAR_HEALTH_TIMEOUT_MS)

  try {
    const request = {
      cache: 'no-store' as RequestCache,
      signal: controller.signal,
    }
    const response = isTauri()
      ? await nativeFetch(`${base}/health`, {
          ...request,
          connectTimeout: SIDECAR_HEALTH_TIMEOUT_MS,
        })
      : await fetch(`${base}/health`, request)
    return response.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function pushBackendLog(target: string[], chunk: unknown) {
  const line = String(chunk).trim()
  if (!line) {
    return
  }

  target.push(line)
  if (target.length > 6) {
    target.shift()
  }
}

function buildBackendErrorMessage(state: BackendLaunchState) {
  if (state.error) {
    return `Lokaler Hintergrunddienst konnte nicht gestartet werden: ${state.error}`
  }

  if (state.close) {
    const code = state.close.code ?? 'unbekannt'
    const details = state.stderr.at(-1) ?? state.stdout.at(-1)
    return details
      ? `Lokaler Hintergrunddienst wurde beendet (Code ${code}): ${details}`
      : `Lokaler Hintergrunddienst wurde beendet (Code ${code}).`
  }

  const details = state.stderr.at(-1) ?? state.stdout.at(-1)
  return details
    ? `Lokaler Hintergrunddienst konnte nicht gestartet werden: ${details}`
    : 'Lokaler Hintergrunddienst konnte nicht gestartet werden.'
}

async function waitForBundledBackend(base: string, state: BackendLaunchState) {
  for (let attempt = 0; attempt < SIDECAR_HEALTH_ATTEMPTS; attempt += 1) {
    if (await pingHealth(base)) {
      return
    }

    await new Promise((resolve) => window.setTimeout(resolve, SIDECAR_HEALTH_INTERVAL_MS))
  }

  throw new Error(buildBackendErrorMessage(state))
}

export function isNativeShell() {
  return isTauri()
}

export async function resolveApiBase(apiBaseUrl: string) {
  const normalized = normalizeBaseUrl(apiBaseUrl)

  if (!isNativeShell() || import.meta.env.DEV) {
    return normalized
  }

  if (normalized !== DEFAULT_API_BASE) {
    return normalized
  }

  return ensureBundledBackend()
}

export async function ensureBundledBackend() {
  if (backendPromise) {
    try {
      const activeBase = await backendPromise
      if (await pingHealth(activeBase)) {
        return activeBase
      }
    } catch {
      // fall through to a fresh spawn attempt
    }

    backendPromise = null
  }

  backendPromise = (async () => {
    for (const port of NATIVE_API_PORTS) {
      const baseUrl = buildNativeApiBaseUrl(port)
      if (await pingHealth(baseUrl)) {
        return baseUrl
      }
    }

    let lastError: Error | null = null

    for (const port of NATIVE_API_PORTS) {
      const baseUrl = buildNativeApiBaseUrl(port)
      const launchState: BackendLaunchState = {
        error: null,
        close: null,
        stderr: [],
        stdout: [],
      }

      const command = Command.sidecar(SIDECAR_NAME, ['--port', String(port)])
      command.stdout.on('data', (line) => {
        pushBackendLog(launchState.stdout, line)
      })
      command.stderr.on('data', (line) => {
        pushBackendLog(launchState.stderr, line)
      })
      command.on('close', (event) => {
        launchState.close = event
      })

      try {
        try {
          await command.spawn()
        } catch (error) {
          launchState.error = String(error)
          throw new Error(buildBackendErrorMessage(launchState))
        }

        await waitForBundledBackend(baseUrl, launchState)
        return baseUrl
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    backendPromise = null
    throw lastError ?? new Error('Lokaler Hintergrunddienst konnte nicht gestartet werden.')
  })()

  return backendPromise
}

export async function applyNativeTheme(themeMode: ThemeMode) {
  if (!isNativeShell()) {
    return
  }

  try {
    await setTheme(themeMode === 'system' ? null : themeMode)
  } catch (error) {
    console.warn('VP26 could not apply native app theme.', error)
  }
}

export async function syncNativeAutostart(enabled: boolean) {
  if (!isNativeShell()) {
    return false
  }

  const current = await isAutostartEnabled()
  if (enabled === current) {
    return current
  }

  if (enabled) {
    await enableAutostart()
    return true
  }

  await disableAutostart()
  return false
}

export async function loadNativeAutostartState() {
  if (!isNativeShell()) {
    return false
  }

  return isAutostartEnabled()
}

export async function syncNativeCloseToTray(enabled: boolean) {
  if (!isNativeShell()) {
    return
  }

  await invoke('set_close_to_tray', { enabled })
}

export async function initializeNativeShell(options: NativeShellOptions) {
  if (!isNativeShell()) {
    return
  }

  void options

  try {
    const shouldLaunchHidden = await invoke<boolean>('should_start_in_tray')
    if (shouldLaunchHidden) {
      await invoke('hide_to_tray')
    }
  } catch {
    // no-op
  }
}

export async function quitNativeApp() {
  if (!isNativeShell()) {
    return
  }

  await invoke('quit_app')
}

export async function notifyPlanChange(title: string, body: string) {
  if (isNativeShell()) {
    let granted = await isPermissionGranted()
    if (!granted) {
      granted = (await requestPermission()) === 'granted'
    }

    if (granted) {
      sendNotification({ title, body })
    }
    return
  }

  if (!('Notification' in window)) {
    return
  }

  let permission = window.Notification.permission
  if (permission === 'default') {
    permission = await window.Notification.requestPermission()
  }

  if (permission === 'granted') {
    new window.Notification(title, { body })
  }
}
