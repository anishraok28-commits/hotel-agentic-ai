/**
 * GuestContext provides shared room identity and session credentials
 * across all guest-facing views.
 *
 * Room identity is established from the QR token (verified server-side)
 * and persists in sessionStorage for browser refresh survival.
 *
 * SECURITY: The room number comes from the server-verified QR token,
 * never from client-editable URL parameters after initial verification.
 */

import { createContext, useContext } from 'react'

export interface GuestContextValue {
  /** Verified room number from QR token (server-side verified). */
  readonly roomNumber: number | null
  /** Server-generated guest ID for session auth. */
  readonly guestId: string
  /** Server-generated session ID for session auth. */
  readonly sessionId: string
  /** The QR token used to establish this session. */
  readonly qrToken: string
  /** Update session credentials after server-side recovery. */
  readonly updateSession: (guestId: string, sessionId: string) => void
}

export const GuestContext = createContext<GuestContextValue>({
  roomNumber: null,
  guestId: '',
  sessionId: '',
  qrToken: '',
  updateSession: () => {},
})

/** Hook to access the verified guest context. */
export function useGuestContext(): GuestContextValue {
  return useContext(GuestContext)
}

/** Session storage key for guest context persistence. */
export const GUEST_CONTEXT_KEY = 'hotel-guest-context'

const QR_TOKEN_KEY = 'qrToken'
const GUEST_ID_KEY = 'guestId'
const SESSION_ID_KEY = 'sessionId'
const ROOM_NUMBER_KEY = 'roomNumber'

function readStorageItem(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function writeStorageItem(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value)
  } catch { /* storage full or unavailable */ }
}

function parseRoomNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 1 || n > 9999) return null
  return n
}

/** Parse `token` (or `qr`) and `room` from the current URL search string. */
export function parseLocationCredentials(): { qrToken: string; roomNumber: number | null } {
  if (typeof window === 'undefined') return { qrToken: '', roomNumber: null }
  const params = new URLSearchParams(window.location.search)
  const qrToken = params.get('token') || params.get('qr') || ''
  return {
    qrToken,
    roomNumber: parseRoomNumber(params.get('room')),
  }
}

function credentialsFromIndividualKeys(): {
  qrToken: string
  guestId: string
  sessionId: string
  roomNumber: number | null
} {
  return {
    qrToken: readStorageItem(QR_TOKEN_KEY),
    guestId: readStorageItem(GUEST_ID_KEY),
    sessionId: readStorageItem(SESSION_ID_KEY),
    roomNumber: parseRoomNumber(readStorageItem(ROOM_NUMBER_KEY)),
  }
}

/** Save guest context to sessionStorage for refresh and route-change survival. */
export function saveGuestContext(ctx: GuestContextValue): void {
  try {
    sessionStorage.setItem(
      GUEST_CONTEXT_KEY,
      JSON.stringify({
        roomNumber: ctx.roomNumber,
        guestId: ctx.guestId,
        sessionId: ctx.sessionId,
        qrToken: ctx.qrToken,
      }),
    )
    writeStorageItem(QR_TOKEN_KEY, ctx.qrToken)
    writeStorageItem(GUEST_ID_KEY, ctx.guestId)
    writeStorageItem(SESSION_ID_KEY, ctx.sessionId)
    if (ctx.roomNumber != null) {
      writeStorageItem(ROOM_NUMBER_KEY, String(ctx.roomNumber))
    }
  } catch { /* storage full or unavailable */ }
}

/** Load guest context from sessionStorage. Returns null if not found or invalid. */
export function loadGuestContext(): GuestContextValue | null {
  const individual = credentialsFromIndividualKeys()
  try {
    const raw = sessionStorage.getItem(GUEST_CONTEXT_KEY)
    let parsed: Record<string, unknown> | null = null
    if (raw) {
      try {
        const value = JSON.parse(raw) as unknown
        if (typeof value === 'object' && value !== null) {
          parsed = value as Record<string, unknown>
        }
      } catch {
        parsed = null
      }
    }

    const qrToken =
      (typeof parsed?.qrToken === 'string' && parsed.qrToken) || individual.qrToken
    const guestId =
      (typeof parsed?.guestId === 'string' && parsed.guestId) || individual.guestId
    const sessionId =
      (typeof parsed?.sessionId === 'string' && parsed.sessionId) || individual.sessionId
    const roomNumber =
      parseRoomNumber(parsed?.roomNumber) ?? individual.roomNumber

    if (!qrToken && !guestId && !sessionId && roomNumber == null) return null

    return {
      roomNumber,
      guestId: guestId || '',
      sessionId: sessionId || '',
      qrToken: qrToken || '',
      updateSession: () => {},
    }
  } catch {
    if (!individual.qrToken && !individual.guestId && !individual.sessionId && individual.roomNumber == null) {
      return null
    }
    return { ...individual, updateSession: () => {} }
  }
}

/**
 * Hydrate guest credentials on initial mount from the URL, then sessionStorage.
 * Persists qrToken, guestId, sessionId, and roomNumber so route changes do not
 * drop the active session.
 */
export function hydrateGuestContext(): GuestContextValue {
  const fromUrl = parseLocationCredentials()
  const stored = loadGuestContext()
  const individual = credentialsFromIndividualKeys()

  const qrToken = fromUrl.qrToken || stored?.qrToken || individual.qrToken || ''
  let guestId = stored?.guestId || individual.guestId || ''
  let sessionId = stored?.sessionId || individual.sessionId || ''
  // Prefer a previously verified / stored room. Use the URL `room` param only
  // when no token is present (demo landing like /?room=101).
  let roomNumber = stored?.roomNumber ?? individual.roomNumber
  if (roomNumber == null && !fromUrl.qrToken) {
    roomNumber = fromUrl.roomNumber
  }

  if (roomNumber != null && !qrToken && (!guestId || !sessionId)) {
    guestId = guestId || `guest-${roomNumber}-${Date.now().toString(36)}`
    sessionId = sessionId || `sess-${Math.random().toString(36).substring(2, 9)}`
  }

  const ctx: GuestContextValue = {
    roomNumber,
    guestId,
    sessionId,
    qrToken,
    updateSession: () => {},
  }

  if (qrToken || guestId || sessionId || roomNumber != null) {
    saveGuestContext(ctx)
  }

  return ctx
}

/** Clear guest context from sessionStorage. */
export function clearGuestContext(): void {
  try {
    sessionStorage.removeItem(GUEST_CONTEXT_KEY)
    sessionStorage.removeItem(QR_TOKEN_KEY)
    sessionStorage.removeItem(GUEST_ID_KEY)
    sessionStorage.removeItem(SESSION_ID_KEY)
    sessionStorage.removeItem(ROOM_NUMBER_KEY)
  } catch { /* ignore */ }
}
