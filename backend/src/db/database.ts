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
  `)
}
