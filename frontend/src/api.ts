import { isTauri } from '@tauri-apps/api/core'
import { fetch as nativeFetch } from '@tauri-apps/plugin-http'
import type { BootstrapResponse, FetchPlanRequest, PlanResponse } from './types'

function normalizeBaseUrl(apiBaseUrl: string) {
  const trimmed = apiBaseUrl.trim()
  if (!trimmed) {
    return '/api'
  }

  const normalized = trimmed.replace(/\/$/, '')
  if (normalized === '/api' || normalized.endsWith('/api')) {
    return normalized
  }

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('/')) {
    return `${normalized}/api`
  }

  return normalized
}

const API_TIMEOUT_MS = 30_000

type FetchOptions = {
  signal?: AbortSignal
  timeoutMs?: number
}

const MOJIBAKE_PATTERN = /[ÃÂâ]/u

function mergeAbortSignals(timeoutSignal: AbortSignal, externalSignal?: AbortSignal) {
  if (!externalSignal) {
    return timeoutSignal
  }

  if (externalSignal.aborted) {
    const aborted = new AbortController()
    aborted.abort()
    return aborted.signal
  }

  const combined = new AbortController()
  const abort = () => combined.abort()

  timeoutSignal.addEventListener('abort', abort, { once: true })
  externalSignal.addEventListener('abort', abort, { once: true })

  return combined.signal
}

function repairMojibake(value: string) {
  if (!MOJIBAKE_PATTERN.test(value)) {
    return value
  }

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return value
  }
}

function extractHtmlErrorMessage(value: string) {
  const withoutScripts = value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, ' ')
  return withoutTags.replace(/\s+/g, ' ').trim()
}

function looksLikeHtmlResponse(value: string) {
  return /<\s*(?:!doctype|html|head|body|title|center)\b/i.test(value)
}

async function readResponseErrorMessage(response: Response, fallback: string) {
  const rawBody = repairMojibake(await response.text())
  if (!rawBody) {
    return fallback
  }

  try {
    const body = repairPayload(JSON.parse(rawBody) as { detail?: string; message?: string; error?: string })
    return body.detail || body.message || body.error || fallback
  } catch {
    const isHtmlResponse =
      response.headers.get('content-type')?.toLowerCase().includes('text/html') || looksLikeHtmlResponse(rawBody)

    if (isHtmlResponse) {
      const htmlMessage = extractHtmlErrorMessage(rawBody)
      if (response.status === 405 || response.status === 404) {
        return 'Die API-Basis zeigt nicht auf das VP26-Backend. Bitte die Basis-URL des Backends eintragen, nicht die normale Website.'
      }

      return htmlMessage || fallback
    }

    return rawBody
  }
}

function repairPayload<T>(value: T): T {
  if (typeof value === 'string') {
    return repairMojibake(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairPayload(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, repairPayload(entry)]),
    ) as T
  }

  return value
}

async function fetchWithTimeout(input: string, init?: RequestInit, options: FetchOptions = {}) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), options.timeoutMs ?? API_TIMEOUT_MS)
  const signal = mergeAbortSignals(controller.signal, options.signal)

  try {
    if (isTauri()) {
      return await nativeFetch(input, {
        ...init,
        signal,
        connectTimeout: options.timeoutMs ?? API_TIMEOUT_MS,
      })
    }

    return await fetch(input, {
      ...init,
      signal,
    })
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.message === 'Request cancelled')
    ) {
      if (options.signal?.aborted) {
        throw error
      }

      throw new Error('Zeitüberschreitung beim Laden des Plans.')
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export async function fetchBootstrap(apiBaseUrl: string, options: FetchOptions = {}): Promise<BootstrapResponse> {
  const base = normalizeBaseUrl(apiBaseUrl)
  const response = await fetchWithTimeout(`${base}/bootstrap`, undefined, options)

  if (!response.ok) {
    throw new Error(
      await readResponseErrorMessage(response, `Bootstrap konnte nicht geladen werden (${response.status}).`),
    )
  }

  return repairPayload((await response.json()) as BootstrapResponse)
}

export async function fetchPlan(
  apiBaseUrl: string,
  payload: FetchPlanRequest,
  options: FetchOptions = {},
): Promise<PlanResponse> {
  const base = normalizeBaseUrl(apiBaseUrl)
  const response = await fetchWithTimeout(
    `${base}/plans/fetch`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    options,
  )

  if (!response.ok) {
    throw new Error(await readResponseErrorMessage(response, `Request failed with status ${response.status}`))
  }

  return repairPayload((await response.json()) as PlanResponse)
}
