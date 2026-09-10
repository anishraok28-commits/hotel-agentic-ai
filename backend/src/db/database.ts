/**
 * SQLite database initialization and schema.
 *
 * Uses better-sqlite3 for synchronous access matching the current code style.
 * DB_PATH env var controls storage:
 *   - file path like "./data/hotel.db" (default) — persistent across restarts
 *   - ":memory:" — ephemeral, lost on restart (for dev/test)
 *
 * Tables are created on first open if they don't exist.
 */

import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let db: Database.Database | null = null

/**
 * Open (or return existing) the SQLite database.
 * Call once at startup; subsequent calls return the same instance.
 */
export function getDatabase(dbPath?: string): Database.Database {
  if (db) return db

  const resolvedPath = dbPath ?? process.env['DB_PATH'] ?? './data/hotel.db'

  // Ensure parent directory exists for file-based databases
  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  db = new Database(resolvedPath)

  // Enable WAL mode for better concurrent read performance (no-op for :memory:)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema(db)
  migrateSchema(db)

  return db
}

/**
 * Replace the current database instance (used for testing with fresh DBs).
 */
export function setDatabase(database: Database.Database): void {
  db = database
}

/**
 * Close the current database connection and reset the singleton.
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * Create all tables if they don't already exist.
 */
function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      room_id INTEGER PRIMARY KEY,
      guest_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      checked_in_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stays (
      stay_id TEXT PRIMARY KEY,
      room_number INTEGER NOT NULL,
      guest_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      qr_token TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'checked_out')),
      checked_in_at INTEGER NOT NULL,
      checked_out_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stays_room ON stays (room_number, status);
    CREATE INDEX IF NOT EXISTS idx_stays_guest ON stays (guest_id, session_id);

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      room_number INTEGER NOT NULL,
      guest_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      items TEXT NOT NULL,
      total INTEGER NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS idempotency (
      key TEXT PRIMARY KEY,
      response_status INTEGER NOT NULL,
      response_body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_guest
      ON orders (guest_id, session_id, room_number);

    CREATE TABLE IF NOT EXISTS rooms (
      room_number INTEGER PRIMARY KEY,
      qr_token TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      hotel_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      what_worked TEXT NOT NULL DEFAULT '',
      what_frustrated TEXT NOT NULL DEFAULT '',
      what_missing TEXT NOT NULL DEFAULT '',
      what_would_pay_for TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      identifier TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK(role IN ('FRONT_DESK', 'KITCHEN', 'MANAGER', 'OWNER')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

/**
 * Safe migrations for adding columns to existing tables.
 * Each migration checks if the column already exists before altering.
 */
function migrateSchema(database: Database.Database): void {
  const sessionColumns = database.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>
  if (!sessionColumns.some((c) => c.name === 'qr_token')) {
    database.exec("ALTER TABLE sessions ADD COLUMN qr_token TEXT NOT NULL DEFAULT ''")
  }

  // Add password_hash to staff_users if missing
  const staffColumns = database.prepare("PRAGMA table_info(staff_users)").all() as Array<{ name: string }>
  if (!staffColumns.some((c) => c.name === 'password_hash')) {
    database.exec("ALTER TABLE staff_users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
  }

  // Add must_change_password flag
  if (!staffColumns.some((c) => c.name === 'must_change_password')) {
    database.exec("ALTER TABLE staff_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0")
  }

  // Add token_version for token revocation
  if (!staffColumns.some((c) => c.name === 'token_version')) {
    database.exec("ALTER TABLE staff_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1")
  }

  // Add failed login tracking
  if (!staffColumns.some((c) => c.name === 'failed_login_attempts')) {
    database.exec("ALTER TABLE staff_users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0")
  }
  if (!staffColumns.some((c) => c.name === 'locked_until')) {
    database.exec("ALTER TABLE staff_users ADD COLUMN locked_until INTEGER NOT NULL DEFAULT 0")
  }

  // Create audit_log table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);
  `)
}
