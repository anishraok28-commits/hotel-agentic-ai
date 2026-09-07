/**
 * SQLite-backed staff role store.
 *
 * Maps staff identifiers (email/employee ID) to roles.
 * Roles: FRONT_DESK, KITCHEN, MANAGER, OWNER
 *
 * Data persists across backend restarts via SQLite.
 */

import { getDatabase } from '../db/database.js'

export type StaffRole = 'FRONT_DESK' | 'KITCHEN' | 'MANAGER' | 'OWNER'

export interface StaffUser {
  readonly id: string
  readonly name: string
  readonly identifier: string
  readonly role: StaffRole
  readonly active: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

/** Get a staff user by their identifier (email/employee ID). */
export function getStaffByIdentifier(identifier: string): StaffUser | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM staff_users WHERE identifier = ? AND active = 1').get(identifier) as
    | {
        id: string
        name: string
        identifier: string
        role: string
        active: number
        created_at: number
        updated_at: number
      }
    | undefined
  if (!row) return undefined
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    role: row.role as StaffRole,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Get a staff user by their ID. */
export function getStaffById(id: string): StaffUser | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(id) as
    | {
        id: string
        name: string
        identifier: string
        role: string
        active: number
        created_at: number
        updated_at: number
      }
    | undefined
  if (!row) return undefined
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    role: row.role as StaffRole,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Create a new staff user. */
export function createStaffUser(
  id: string,
  name: string,
  identifier: string,
  role: StaffRole,
): StaffUser {
  const now = Date.now()
  const db = getDatabase()
  db.prepare(
    'INSERT INTO staff_users (id, name, identifier, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
  ).run(id, name, identifier, role, now, now)
  return { id, name, identifier, role, active: true, createdAt: now, updatedAt: now }
}

/** Test helper: clear all staff users. */
export function clearStaffUsers(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM staff_users').run()
}
