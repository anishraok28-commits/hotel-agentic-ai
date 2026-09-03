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
}

export const GuestContext = createContext<GuestContextValue>({
  roomNumber: null,
  guestId: '',
  sessionId: '',
  qrToken: '',
})

/** Hook to access the verified guest context. */
export function useGuestContext(): GuestContextValue {
  return useContext(GuestContext)
}

/** Session storage key for guest context persistence. */
export const GUEST_CONTEXT_KEY = 'hotel-guest-context'

/** Save guest context to sessionStorage for refresh survival. */
export function saveGuestContext(ctx: GuestContextValue): void {
  try {
    sessionStorage.setItem(GUEST_CONTEXT_KEY, JSON.stringify(ctx))
  } catch { /* storage full or unavailable */ }
}

/** Load guest context from sessionStorage. Returns null if not found or invalid. */
export function loadGuestContext(): GuestContextValue | null {
  try {
    const raw = sessionStorage.getItem(GUEST_CONTEXT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.guestId !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.qrToken !== 'string'
    ) return null
    return {
      roomNumber: typeof parsed.roomNumber === 'number' ? parsed.roomNumber : null,
      guestId: parsed.guestId,
      sessionId: parsed.sessionId,
      qrToken: parsed.qrToken,
    }
  } catch {
    return null
  }
}

/** Clear guest context from sessionStorage. */
export function clearGuestContext(): void {
  try {
    sessionStorage.removeItem(GUEST_CONTEXT_KEY)
  } catch { /* ignore */ }
}
