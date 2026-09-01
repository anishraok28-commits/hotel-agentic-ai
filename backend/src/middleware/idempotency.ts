/**
 * SQLite-backed idempotency store for service requests.
 *
 * Prevents duplicate webhook calls when the same request is submitted
 * multiple times (e.g. double-click, network retry, explicit replay).
 *
 * Strategy:
 * - Client sends an `X-Idempotency-Key` header (UUID recommended).
 * - Server stores the response keyed by that header value.
 * - Repeated requests with the same key return the cached response
 *   without triggering another webhook call.
 * - Entries expire after `ttlMs` (default 15 minutes) and are pruned
 *   lazily on access or when the table exceeds 1000 rows.
 *
 * Data persists across backend restarts via SQLite.
 */

import { getDatabase } from '../db/database.js'

export interface IdempotencyEntry {
  readonly responseStatus: number
  readonly responseBody: unknown
  readonly createdAt: number
}

export interface IdempotencyStore {
  /** Returns the cached response if the key exists and has not expired. */
  get(key: string): IdempotencyEntry | undefined
  /** Stores a response under the given key. */
  set(key: string, status: number, body: unknown): void
}

const DEFAULT_TTL_MS = 15 * 60 * 1000 // 15 minutes

export function createIdempotencyStore(ttlMs: number = DEFAULT_TTL_MS): IdempotencyStore {
  function prune(now: number): void {
    const db = getDatabase()
    const count = (db.prepare('SELECT COUNT(*) as cnt FROM idempotency').get() as { cnt: number }).cnt
    if (count < 1000) return
    db.prepare('DELETE FROM idempotency WHERE ? - created_at >= ?').run(now, ttlMs)
  }

  return {
    get(key: string): IdempotencyEntry | undefined {
      prune(Date.now())
      const db = getDatabase()
      const row = db.prepare(
        'SELECT response_status, response_body, created_at FROM idempotency WHERE key = ?',
      ).get(key) as
        | { response_status: number; response_body: string; created_at: number }
        | undefined

      if (!row) return undefined
      if (Date.now() - row.created_at >= ttlMs) {
        db.prepare('DELETE FROM idempotency WHERE key = ?').run(key)
        return undefined
      }

      return {
        responseStatus: row.response_status,
        responseBody: JSON.parse(row.response_body),
        createdAt: row.created_at,
      }
    },

    set(key: string, status: number, body: unknown): void {
      const db = getDatabase()
      db.prepare(
        'INSERT OR REPLACE INTO idempotency (key, response_status, response_body, created_at) VALUES (?, ?, ?, ?)',
      ).run(key, status, JSON.stringify(body), Date.now())
    },
  }
}
