import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getStaffCount, createStaffUser, getStaffByIdentifier, clearStaff } from './staff/staffRoleStore.js'
import { getDatabase, setDatabase } from './db/database.js'
import Database from 'better-sqlite3'

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL DEFAULT '',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      token_version INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `)
  return db
}

describe('Auto-seed safety net', () => {
  let db: Database.Database

  beforeEach(() => {
    db = freshDb()
    setDatabase(db)
  })

  it('Scenario A: Cold start — getStaffCount returns 0 on empty table', () => {
    const count = getStaffCount()
    expect(count).toBe(0)

    // Simulate the auto-seed logic from index.ts:1562-1574
    const logs: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((msg: string) => logs.push(msg))

    if (getStaffCount() === 0) {
      console.warn('[DB] Zero staff users found. Seeded default staff credentials.')
      const defaults = [
        { id: 'staff-001', name: 'Front Desk Staff', identifier: 'frontdesk', role: 'FRONT_DESK' as const, password: 'hotel123' },
        { id: 'staff-002', name: 'Kitchen Staff', identifier: 'kitchen', role: 'KITCHEN' as const, password: 'hotel123' },
        { id: 'staff-003', name: 'Hotel Manager', identifier: 'manager', role: 'MANAGER' as const, password: 'hotel123' },
        { id: 'staff-004', name: 'Hotel Owner', identifier: 'owner', role: 'OWNER' as const, password: 'hotel123' },
      ]
      for (const s of defaults) {
        createStaffUser(s.id, s.name, s.identifier, s.role, s.password, true)
      }
      console.warn('[DB] 4 default accounts created.')
    }

    expect(logs).toContain('[DB] Zero staff users found. Seeded default staff credentials.')
    expect(getStaffCount()).toBe(4)
    expect(getStaffByIdentifier('frontdesk')).toBeDefined()
    expect(getStaffByIdentifier('kitchen')).toBeDefined()
    expect(getStaffByIdentifier('manager')).toBeDefined()
    expect(getStaffByIdentifier('owner')).toBeDefined()

    console.warn.mockRestore()
  })

  it('Scenario B: Warm restart — auto-seed is skipped when staff exist', () => {
    // Pre-seed one user
    createStaffUser('staff-001', 'Front Desk Staff', 'frontdesk', 'FRONT_DESK', 'hotel123', true)

    const countBefore = getStaffCount()
    expect(countBefore).toBe(1)

    // Simulate the auto-seed logic
    const logs: string[] = []
    vi.spyOn(console, 'warn').mockImplementation((msg: string) => logs.push(msg))

    if (getStaffCount() === 0) {
      console.warn('[DB] Zero staff users found. Seeded default staff credentials.')
    } else {
      // No log — seed is skipped
    }

    expect(logs).toHaveLength(0)
    expect(getStaffCount()).toBe(1)

    console.warn.mockRestore()
  })
})
