/**
 * SQLite-backed room store.
 *
 * Each room has a unique QR token that encodes the room number.
 * The QR code links to the frontend with this token, and the backend
 * verifies the token cryptographically before establishing a guest session.
 *
 * Data persists across backend restarts via SQLite.
 */

import { getDatabase } from '../db/database.js'

export interface Room {
  readonly roomNumber: number
  readonly qrToken: string
  readonly active: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

/** Create a new room with a QR token. */
export function createRoom(roomNumber: number, qrToken: string): Room {
  const now = Date.now()
  const db = getDatabase()
  db.prepare(
    'INSERT INTO rooms (room_number, qr_token, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
  ).run(roomNumber, qrToken, now, now)
  return { roomNumber, qrToken, active: true, createdAt: now, updatedAt: now }
}

/** Get a room by its room number. */
export function getRoomByNumber(roomNumber: number): Room | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(roomNumber) as
    | { room_number: number; qr_token: string; active: number; created_at: number; updated_at: number }
    | undefined
  if (!row) return undefined
  return {
    roomNumber: row.room_number,
    qrToken: row.qr_token,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Get a room by its QR token. */
export function getRoomByToken(qrToken: string): Room | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM rooms WHERE qr_token = ?').get(qrToken) as
    | { room_number: number; qr_token: string; active: number; created_at: number; updated_at: number }
    | undefined
  if (!row) return undefined
  return {
    roomNumber: row.room_number,
    qrToken: row.qr_token,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** List all rooms. */
export function listRooms(): Room[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM rooms ORDER BY room_number').all() as Array<{
    room_number: number
    qr_token: string
    active: number
    created_at: number
    updated_at: number
  }>
  return rows.map((row) => ({
    roomNumber: row.room_number,
    qrToken: row.qr_token,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

/** Update a room's active status. */
export function updateRoomActive(
  roomNumber: number,
  active: boolean,
): Room | undefined {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE rooms SET active = ?, updated_at = ? WHERE room_number = ?',
  ).run(active ? 1 : 0, now, roomNumber)
  if (result.changes === 0) return undefined
  return getRoomByNumber(roomNumber)
}

/** Test helper: clear all rooms. */
export function clearRooms(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM rooms').run()
}
