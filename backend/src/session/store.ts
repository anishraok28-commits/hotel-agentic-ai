/**
 * SQLite-backed guest session store.
 *
 * Each room can have one active session at a time. A session is created
 * at check-in and expires at checkout. The QR token is the only way to
 * prove the guest is in the room — a room number alone is never trusted.
 *
 * Data persists across backend restarts via SQLite.
 */

import { getDatabase } from '../db/database.js'

export interface GuestSession {
  readonly roomId: number
  readonly guestId: string
  readonly sessionId: string
  readonly checkedInAt: number
  readonly expiresAt: number
}

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

  const db = getDatabase()
  db.prepare(
    'INSERT OR REPLACE INTO sessions (room_id, guest_id, session_id, checked_in_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(roomId, guestId, sessionId, session.checkedInAt, session.expiresAt)

  return session
}

/** Retrieve the active session for a room, or undefined if none or expired. */
export function getSession(roomId: number): GuestSession | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM sessions WHERE room_id = ?').get(roomId) as
    | { room_id: number; guest_id: string; session_id: string; checked_in_at: number; expires_at: number }
    | undefined

  if (!row) return undefined

  if (Date.now() > row.expires_at) {
    db.prepare('DELETE FROM sessions WHERE room_id = ?').run(roomId)
    return undefined
  }

  return {
    roomId: row.room_id,
    guestId: row.guest_id,
    sessionId: row.session_id,
    checkedInAt: row.checked_in_at,
    expiresAt: row.expires_at,
  }
}

/** Explicitly check out a room (expire the session). */
export function checkOut(roomId: number): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM sessions WHERE room_id = ?').run(roomId)
  return result.changes > 0
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
  const db = getDatabase()
  db.prepare('DELETE FROM sessions').run()
}
