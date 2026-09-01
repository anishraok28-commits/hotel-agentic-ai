/**
 * Persistence / restart tests.
 *
 * Verifies that data survives a simulated backend restart by:
 * 1. Writing data to SQLite-backed stores
 * 2. Closing the database connection
 * 3. Reopening it (simulating a process restart)
 * 4. Confirming data is still there
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getDatabase, closeDatabase } from '../db/database.js'
import { createOrder, getOrder, clearOrders } from '../order/store.js'
import { checkIn, getSession, clearSessions } from '../session/store.js'
import { createIdempotencyStore } from '../middleware/idempotency.js'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'hotel-test-'))
  // Close any existing connection from previous tests
  closeDatabase()
})

afterEach(() => {
  closeDatabase()
  rmSync(tempDir, { recursive: true, force: true })
})

describe('SQLite persistence across restarts', () => {
  it('orders survive a simulated backend restart', () => {
    const dbPath = join(tempDir, 'test.db')

    // Phase 1: Write data
    getDatabase(dbPath)
    createOrder({
      orderId: 'order-persist-1',
      requestId: 'req-p1',
      roomNumber: 201,
      guestId: 'guest-p1',
      sessionId: 'session-p1',
      items: [{ itemId: 'menu.001', name: 'Burger', quantity: 2, unitPrice: 1500 }],
      total: 3000,
      notes: 'extra sauce',
    })

    // Phase 2: Simulate restart (close DB)
    closeDatabase()

    // Phase 3: Reopen DB (simulates new process)
    getDatabase(dbPath)

    // Phase 4: Verify data persisted
    const order = getOrder('order-persist-1')
    expect(order).toBeDefined()
    expect(order?.orderId).toBe('order-persist-1')
    expect(order?.roomNumber).toBe(201)
    expect(order?.guestId).toBe('guest-p1')
    expect(order?.total).toBe(3000)
    expect(order?.notes).toBe('extra sauce')
    expect(order?.status).toBe('NEW')
    expect(order?.items).toEqual([
      { itemId: 'menu.001', name: 'Burger', quantity: 2, unitPrice: 1500 },
    ])
  })

  it('sessions survive a simulated backend restart', () => {
    const dbPath = join(tempDir, 'test.db')

    // Phase 1: Write data
    getDatabase(dbPath)
    checkIn(305, 'guest-s1', 'session-s1', 24 * 60 * 60 * 1000)

    // Phase 2: Simulate restart
    closeDatabase()

    // Phase 3: Reopen
    getDatabase(dbPath)

    // Phase 4: Verify
    const session = getSession(305)
    expect(session).toBeDefined()
    expect(session?.guestId).toBe('guest-s1')
    expect(session?.sessionId).toBe('session-s1')
    expect(session?.roomId).toBe(305)
    expect(session?.expiresAt).toBeGreaterThan(Date.now())
  })

  it('expired sessions are cleaned up after restart', () => {
    const dbPath = join(tempDir, 'test.db')

    // Phase 1: Write a session with a very short TTL (already expired by now)
    getDatabase(dbPath)
    const db = getDatabase()
    // Insert an already-expired session directly
    db.prepare(
      'INSERT INTO sessions (room_id, guest_id, session_id, checked_in_at, expires_at) VALUES (?, ?, ?, ?, ?)',
    ).run(400, 'guest-expired', 'session-expired', Date.now() - 10000, Date.now() - 5000)

    // Phase 2: Restart
    closeDatabase()

    // Phase 3: Reopen
    getDatabase(dbPath)

    // Phase 4: Expired session should be gone on access
    const session = getSession(400)
    expect(session).toBeUndefined()
  })

  it('idempotency records survive a restart', () => {
    const dbPath = join(tempDir, 'test.db')

    // Phase 1: Write data
    getDatabase(dbPath)
    const store = createIdempotencyStore()
    store.set('idem-key-1', 202, { status: 'accepted', requestId: 'r1' })

    // Phase 2: Restart
    closeDatabase()

    // Phase 3: Reopen
    getDatabase(dbPath)
    const store2 = createIdempotencyStore()

    // Phase 4: Verify
    const entry = store2.get('idem-key-1')
    expect(entry).toBeDefined()
    expect(entry?.responseStatus).toBe(202)
    expect(entry?.responseBody).toEqual({ status: 'accepted', requestId: 'r1' })
  })

  it('data persists to a real file on disk', () => {
    const dbPath = join(tempDir, 'real-file.db')

    // Write data
    getDatabase(dbPath)
    createOrder({
      orderId: 'order-file-1',
      requestId: 'req-f1',
      roomNumber: 501,
      guestId: 'guest-f1',
      sessionId: 'session-f1',
      items: [{ itemId: 'menu.002', name: 'Pizza', quantity: 1, unitPrice: 2000 }],
      total: 2000,
      notes: undefined,
    })
    closeDatabase()

    // Verify the file exists
    expect(existsSync(dbPath)).toBe(true)

    // Reopen and verify
    getDatabase(dbPath)
    const order = getOrder('order-file-1')
    expect(order).toBeDefined()
    expect(order?.total).toBe(2000)
  })
})

describe('clearOrders and clearSessions (test helpers)', () => {
  it('clearOrders removes all orders from SQLite', () => {
    const dbPath = join(tempDir, 'test.db')
    getDatabase(dbPath)

    createOrder({
      orderId: 'order-clear-1',
      requestId: 'req-c1',
      roomNumber: 100,
      guestId: 'g1',
      sessionId: 's1',
      items: [],
      total: 0,
      notes: undefined,
    })

    expect(getOrder('order-clear-1')).toBeDefined()
    clearOrders()
    expect(getOrder('order-clear-1')).toBeUndefined()
  })

  it('clearSessions removes all sessions from SQLite', () => {
    const dbPath = join(tempDir, 'test.db')
    getDatabase(dbPath)

    checkIn(100, 'g1', 's1', 60_000)
    expect(getSession(100)).toBeDefined()
    clearSessions()
    expect(getSession(100)).toBeUndefined()
  })
})
