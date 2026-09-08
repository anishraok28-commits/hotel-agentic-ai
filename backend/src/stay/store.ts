/**
 * SQLite-backed stay store.
 *
 * A "stay" represents a guest's occupancy of a room from check-in to checkout.
 * Unlike sessions (which are deleted on checkout), stays are preserved as
 * historical records. Multiple stays can exist for the same room over time,
 * but only one can be active at a time.
 *
 * The stay is the source of truth for cross-device state: all devices
 * scanning the same QR resolve to the same active stay.
 */

import { getDatabase } from '../db/database.js'

export interface Stay {
  readonly stayId: string
  readonly roomNumber: number
  readonly guestId: string
  readonly sessionId: string
  readonly qrToken: string
  readonly status: 'active' | 'checked_out'
  readonly checkedInAt: number
  readonly checkedOutAt: number | null
  readonly createdAt: number
}

/** Create a new active stay for a room. */
export function createStay(params: {
  readonly stayId: string
  readonly roomNumber: number
  readonly guestId: string
  readonly sessionId: string
  readonly qrToken: string
}): Stay {
  const now = Date.now()
  const db = getDatabase()
  db.prepare(
    `INSERT INTO stays (stay_id, room_number, guest_id, session_id, qr_token, status, checked_in_at, checked_out_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, NULL, ?)`,
  ).run(params.stayId, params.roomNumber, params.guestId, params.sessionId, params.qrToken, now, now)
  return {
    stayId: params.stayId,
    roomNumber: params.roomNumber,
    guestId: params.guestId,
    sessionId: params.sessionId,
    qrToken: params.qrToken,
    status: 'active',
    checkedInAt: now,
    checkedOutAt: null,
    createdAt: now,
  }
}

/** Get the active stay for a room, or undefined if none. */
export function getActiveStay(roomNumber: number): Stay | undefined {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM stays WHERE room_number = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 1',
  ).get(roomNumber) as {
    stay_id: string; room_number: number; guest_id: string; session_id: string;
    qr_token: string; status: string; checked_in_at: number; checked_out_at: number | null;
    created_at: number
  } | undefined
  if (!row) return undefined
  return {
    stayId: row.stay_id,
    roomNumber: row.room_number,
    guestId: row.guest_id,
    sessionId: row.session_id,
    qrToken: row.qr_token,
    status: row.status as 'active' | 'checked_out',
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    createdAt: row.created_at,
  }
}

/** Get the active stay by its guestId + sessionId (cross-device resolution). */
export function getActiveStayByCredentials(
  guestId: string,
  sessionId: string,
): Stay | undefined {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM stays WHERE guest_id = ? AND session_id = ? AND status = \'active\' ORDER BY created_at DESC LIMIT 1',
  ).get(guestId, sessionId) as {
    stay_id: string; room_number: number; guest_id: string; session_id: string;
    qr_token: string; status: string; checked_in_at: number; checked_out_at: number | null;
    created_at: number
  } | undefined
  if (!row) return undefined
  return {
    stayId: row.stay_id,
    roomNumber: row.room_number,
    guestId: row.guest_id,
    sessionId: row.session_id,
    qrToken: row.qr_token,
    status: row.status as 'active' | 'checked_out',
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    createdAt: row.created_at,
  }
}

/** Checkout a stay: mark as checked_out and record the timestamp. */
export function checkoutStay(stayId: string): Stay | undefined {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE stays SET status = \'checked_out\', checked_out_at = ? WHERE stay_id = ? AND status = \'active\'',
  ).run(now, stayId)
  if (result.changes === 0) return undefined
  const row = db.prepare('SELECT * FROM stays WHERE stay_id = ?').get(stayId) as {
    stay_id: string; room_number: number; guest_id: string; session_id: string;
    qr_token: string; status: string; checked_in_at: number; checked_out_at: number | null;
    created_at: number
  }
  return {
    stayId: row.stay_id,
    roomNumber: row.room_number,
    guestId: row.guest_id,
    sessionId: row.session_id,
    qrToken: row.qr_token,
    status: row.status as 'active' | 'checked_out',
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    createdAt: row.created_at,
  }
}

/** Test helper: clear all stays. */
export function clearStays(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM stays').run()
}
