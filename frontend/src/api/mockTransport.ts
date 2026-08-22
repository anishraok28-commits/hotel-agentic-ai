/**
 * Submission transport.
 *
 * While MOCK_API_ENABLED is true every submission resolves against this
 * in-memory mock. When MOCK_API_ENABLED is false (VITE_MOCK_API_ENABLED=false),
 * submissions are POSTed to the Backend via fetch.
 *
 * The public API mirrors the fetch layer so modes never know that they are
 * talking to a mock today and the Backend tomorrow.
 */

import type {
  ApiErrorResponse,
  ApiSuccessResponse,
} from '@/api/types'
import type { FutureApiRoute } from '@/api/apiContract'
import { appConfig, MOCK_API_ENABLED } from '@/config/appConfig'

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const FETCH_TIMEOUT_MS = 30_000

let requestCounter = 0

function nextRequestId(): string {
  requestCounter += 1
  return `mock-${Date.now()}-${requestCounter}`
}

/** Dummy guest + session ids so payloads stay contract-complete. */
export interface GuestContext {
  guestId: string
  sessionId: string
}

export function createGuestContext(): GuestContext {
  const randomPart = Math.random().toString(36).slice(2, 12)
  return {
    guestId: `guest-${randomPart}`,
    sessionId: `session-${randomPart}`,
  }
}

/**
 * Submit a mode submission and await the Backend response.
 * Resolves against the in-memory mock while MOCK_API_ENABLED is true;
 * otherwise POSTs to the Backend at appConfig.apiBaseUrl + route.
 */
export async function submit(
  route: FutureApiRoute,
  payload: unknown,
): Promise<ApiSuccessResponse | ApiErrorResponse> {
  if (MOCK_API_ENABLED) {
    await sleep(600)

    return {
      status: 'accepted',
      requestId: nextRequestId(),
      message: 'Request mock-accepted. Real automation is not connected yet.',
      data: { submittedAt: new Date().toISOString() },
    }
  }

  const url = `${appConfig.apiBaseUrl}${pathForRoute(route)}`
  const token = import.meta.env.VITE_SERVICE_TOKEN
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await parseResponseBody(response)
      if (isErrorResponse(body)) {
        return body
      }
      return {
        status: 'error',
        requestId: 'local-http',
        message: `The backend returned an error (HTTP ${response.status}).`,
        code: 'INTERNAL_ERROR',
      }
    }

    const body = await parseResponseBody(response)
    if (isSuccessResponse(body)) {
      return body
    }
    if (isErrorResponse(body)) {
      return body
    }
    return {
      status: 'error',
      requestId: 'local-parse',
      message: 'The backend returned an unexpected response.',
      code: 'INTERNAL_ERROR',
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        requestId: 'local-timeout',
        message: 'The request timed out. Please try again.',
        code: 'INTERNAL_ERROR',
      }
    }
    return {
      status: 'error',
      requestId: 'local-network',
      message: 'Failed to reach the backend service',
      code: 'AUTOMATION_FAILED',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSuccessResponse(value: unknown): value is ApiSuccessResponse {
  return isRecord(value) && value.status === 'accepted' && typeof value.message === 'string'
}

function isErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    value.status === 'error' &&
    typeof value.message === 'string' &&
    typeof value.code === 'string'
  )
}

function pathForRoute(route: FutureApiRoute): string {
  return route.slice('POST '.length)
}