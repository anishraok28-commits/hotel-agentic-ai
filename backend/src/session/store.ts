/**
 * In-memory guest session store.
 *
 * Each room can have one active session at a time. A session is created
 * at check-in and expires at checkout. The QR token is the only way to
 * prove the guest is in the room — a room number alone is never trusted.
 *
 * This store is intentionally simple and in-memory. For production, it
 * should be replaced with a persistent store that survives restarts.
 */

export interface GuestSession {
  readonly roomId: number
  readonly guestId: string
  readonly sessionId: string
  readonly checkedInAt: number
  readonly expiresAt: number
}

const sessions = new Map<number, GuestSession>()

/** Create or replace a session for a room. Returns the new session. */
export function checkIn(
  roomId: number,
  guestId: string,
  sessionId: string,
  ttlMs: number,
): GuestSession {
  const now = Date.now()
  const session: GuestSession = {
    roomId,
    guestId,
    sessionId,
    checkedInAt: now,
    expiresAt: now + ttlMs,
  }
  sessions.set(roomId, session)
  return session
}

/** Retrieve the active session for a room, or undefined if none or expired. */
export function getSession(roomId: number): GuestSession | undefined {
  const session = sessions.get(roomId)
  if (!session) return undefined
  if (Date.now() > session.expiresAt) {
    sessions.delete(roomId)
    return undefined
  }
  return session
}

/** Explicitly check out a room (expire the session). */
export function checkOut(roomId: number): boolean {
  return sessions.delete(roomId)
}

/** Verify that a session is valid and belongs to the given room + guest. */
export function verifySession(
  roomId: number,
  guestId: string,
  sessionId: string,
): GuestSession | undefined {
  const session = getSession(roomId)
  if (!session) return undefined
  if (session.guestId !== guestId || session.sessionId !== sessionId) return undefined
  return session
}

/** Test helper: clear all sessions. */
export function clearSessions(): void {
  sessions.clear()
}
