/**
 * SQLite-backed staff role store.
 *
 * Maps staff identifiers (email/employee ID) to roles.
 * Roles: FRONT_DESK, KITCHEN, MANAGER, OWNER
 *
 * Data persists across backend restarts via SQLite.
 */

import { getDatabase } from '../db/database.js'
import { hashPassword, verifyPassword } from '../auth/password.js'

export type StaffRole = 'FRONT_DESK' | 'KITCHEN' | 'MANAGER' | 'OWNER'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

export interface StaffUser {
  readonly id: string
  readonly name: string
  readonly identifier: string
  readonly role: StaffRole
  readonly active: boolean
  readonly mustChangePassword: boolean
  readonly tokenVersion: number
  readonly createdAt: number
  readonly updatedAt: number
}

interface StaffUserRow {
  readonly id: string
  readonly name: string
  readonly identifier: string
  readonly role: string
  readonly active: number
  readonly password_hash: string
  readonly must_change_password: number
  readonly token_version: number
  readonly failed_login_attempts: number
  readonly locked_until: number
  readonly created_at: number
  readonly updated_at: number
}

function rowToUser(row: StaffUserRow): StaffUser {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    role: row.role as StaffRole,
    active: row.active === 1,
    mustChangePassword: row.must_change_password === 1,
    tokenVersion: row.token_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Get the total count of staff users in the database. */
export function getStaffCount(): number {
  const db = getDatabase()
  const row = db.prepare('SELECT COUNT(*) as count FROM staff_users').get() as { count: number }
  return row.count
}

/** Get a staff user by their identifier (email/employee ID). */
export function getStaffByIdentifier(identifier: string): StaffUser | undefined {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM staff_users WHERE identifier = ? AND active = 1',
  ).get(identifier) as StaffUserRow | undefined
  if (!row) return undefined
  return rowToUser(row)
}

/** Get a staff user by their ID. */
export function getStaffById(id: string): StaffUser | undefined {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM staff_users WHERE id = ?',
  ).get(id) as StaffUserRow | undefined
  if (!row) return undefined
  return rowToUser(row)
}

/** Get a staff user by ID, including inactive users (for admin purposes). */
export function getStaffByIdIncludeInactive(id: string): StaffUser | undefined {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM staff_users WHERE id = ?',
  ).get(id) as StaffUserRow | undefined
  if (!row) return undefined
  return rowToUser(row)
}

/** List all staff users (optionally including inactive). */
export function listStaffUsers(includeInactive = false): StaffUser[] {
  const db = getDatabase()
  const query = includeInactive
    ? 'SELECT * FROM staff_users ORDER BY created_at DESC'
    : 'SELECT * FROM staff_users WHERE active = 1 ORDER BY created_at DESC'
  const rows = db.prepare(query).all() as StaffUserRow[]
  return rows.map(rowToUser)
}

/** Create a new staff user. */
export function createStaffUser(
  id: string,
  name: string,
  identifier: string,
  role: StaffRole,
  password: string,
  mustChangePassword = false,
): StaffUser {
  const now = Date.now()
  const db = getDatabase()
  const passwordHash = hashPassword(password)
  db.prepare(
    `INSERT INTO staff_users (id, name, identifier, role, password_hash, must_change_password, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, name, identifier, role, passwordHash, mustChangePassword ? 1 : 0, now, now)
  return {
    id, name, identifier, role,
    active: true,
    mustChangePassword,
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

/** Update a staff user's role. */
export function updateStaffRole(id: string, role: StaffRole): StaffUser | undefined {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE staff_users SET role = ?, updated_at = ? WHERE id = ?',
  ).run(role, now, id)
  if (result.changes === 0) return undefined
  return getStaffById(id)
}

/** Deactivate a staff user (soft delete). */
export function deactivateStaffUser(id: string): boolean {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE staff_users SET active = 0, updated_at = ? WHERE id = ?',
  ).run(now, id)
  return result.changes > 0
}

/** Reactivate a staff user. */
export function reactivateStaffUser(id: string): boolean {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE staff_users SET active = 1, updated_at = ? WHERE id = ?',
  ).run(now, id)
  return result.changes > 0
}

/** Change a staff user's password. */
export function changeStaffPassword(id: string, newPassword: string): boolean {
  const db = getDatabase()
  const now = Date.now()
  const passwordHash = hashPassword(newPassword)
  const result = db.prepare(
    `UPDATE staff_users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, updated_at = ? WHERE id = ?`,
  ).run(passwordHash, now, id)
  return result.changes > 0
}

/** Mark that a user must change their password. */
export function setMustChangePassword(id: string, mustChange: boolean): boolean {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE staff_users SET must_change_password = ?, updated_at = ? WHERE id = ?',
  ).run(mustChange ? 1 : 0, now, id)
  return result.changes > 0
}

/** Increment token version to invalidate all existing tokens. */
export function invalidateAllTokens(id: string): boolean {
  const db = getDatabase()
  const now = Date.now()
  const result = db.prepare(
    'UPDATE staff_users SET token_version = token_version + 1, updated_at = ? WHERE id = ?',
  ).run(now, id)
  return result.changes > 0
}

/** Record a failed login attempt. Returns true if the account is now locked. */
export function recordFailedLogin(identifier: string): { locked: boolean; attempts: number } {
  const db = getDatabase()
  const now = Date.now()

  const row = db.prepare(
    'SELECT failed_login_attempts, locked_until FROM staff_users WHERE identifier = ? AND active = 1',
  ).get(identifier) as { failed_login_attempts: number; locked_until: number } | undefined

  if (!row) return { locked: false, attempts: 0 }

  // Check if currently locked
  if (row.locked_until > now) {
    return { locked: true, attempts: row.failed_login_attempts }
  }

  const newAttempts = row.failed_login_attempts + 1
  if (newAttempts >= MAX_FAILED_ATTEMPTS) {
    db.prepare(
      'UPDATE staff_users SET failed_login_attempts = ?, locked_until = ? WHERE identifier = ?',
    ).run(newAttempts, now + LOCKOUT_DURATION_MS, identifier)
    return { locked: true, attempts: newAttempts }
  }

  db.prepare(
    'UPDATE staff_users SET failed_login_attempts = ? WHERE identifier = ?',
  ).run(newAttempts, identifier)
  return { locked: false, attempts: newAttempts }
}

/** Reset failed login attempts on successful login. */
export function resetFailedLogin(identifier: string): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE staff_users SET failed_login_attempts = 0, locked_until = 0 WHERE identifier = ?',
  ).run(identifier)
}

/** Check if an account is currently locked. */
export function isAccountLocked(identifier: string): boolean {
  const db = getDatabase()
  const now = Date.now()
  const row = db.prepare(
    'SELECT locked_until FROM staff_users WHERE identifier = ? AND active = 1',
  ).get(identifier) as { locked_until: number } | undefined
  if (!row) return false
  return row.locked_until > now
}

/** Verify staff credentials (identifier + password). Returns the user if valid. */
export function verifyStaffCredentials(
  identifier: string,
  password: string,
): StaffUser | null {
  const db = getDatabase()
  const row = db.prepare(
    'SELECT * FROM staff_users WHERE identifier = ? AND active = 1',
  ).get(identifier) as StaffUserRow | undefined

  if (!row) return null
  if (!row.password_hash) return null

  const valid = verifyPassword(password, row.password_hash)
  if (!valid) return null

  return rowToUser(row)
}

/** Test helper: clear all staff users. */
export function clearStaffUsers(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM staff_users').run()
}
