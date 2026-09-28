/**
 * Centralised fetch wrapper for staff‑authenticated endpoints.
 *
 * - Adds the Bearer token from sessionStorage (via getAuthToken).
 * - On HTTP 401 the stored staff token is considered invalid/expired/revoked:
 *     * clears the auth keys from sessionStorage
 *     * redirects to the login page with a query flag so the user sees a clear message
 * - All other status codes (including 403) are returned untouched so callers can keep
 *   their existing permission‑denied handling.
 *
 * Guest‑only calls (QR token + session) must NOT use this helper.
 */

import { getAuthToken } from '@/auth/AuthContext'
import { MOCK_API_ENABLED } from '@/config/appConfig'

const FETCH_TIMEOUT_MS = 30_000
const AUTH_TOKEN_KEY = 'staff-auth-token'
const AUTH_USER_KEY = 'staff-auth-user'

function clearStaffAuthStorage(): void {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    sessionStorage.removeItem(AUTH_USER_KEY)
  } catch {
    // sessionStorage may be unavailable
  }
}

/**
 * Perform a fetch that is protected by staff Bearer authentication.
 * If the backend replies 401 we treat the token as dead, wipe local storage
 * and navigate to /login?sessionExpired=1.
 *
 * The caller still receives a Response object for any non‑401 status
 * (including 403) so existing error handling can stay unchanged.
 */
export async function authFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  // In mock mode the caller should have returned early; this helper is only used in real mode.
  if (MOCK_API_ENABLED) {
    throw new Error('authFetch must not be used while MOCK_API_ENABLED=true')
  }

  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (response.status === 401) {
    // Token rejected – purge local auth state and send the user back to login.
    clearStaffAuthStorage()
    // Use replace to avoid polluting history with the dead‑token page.
    window.location.replace(`${window.location.origin}/login?sessionExpired=1`)
    // The navigation will abort further code execution, but we still return the response
    // for type‑safety.
    return response
  }

  return response
}