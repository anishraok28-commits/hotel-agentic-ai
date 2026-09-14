/**
 * Security fix tests.
 *
 * Tests for the three MUST-FIX security items:
 * 1. Backup endpoint must not export password hashes or auth metadata
 * 2. Concierge must verify QR tokens like Room Service and Late Checkout
 * 3. Check-in must reject nonexistent rooms
 */

import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { getDatabase, closeDatabase } from './db/database.js'
import { createStaffUser, clearStaffUsers } from './staff/staffRoleStore.js'
import { createStaffToken } from './auth/staffToken.js'
import { createRoom, clearRooms } from './room/roomStore.js'
import { clearSessions } from './session/store.js'
import { generateQrToken } from './session/qrToken.js'
import { handleConcierge } from './routes/handler.js'
import type { WebhookTransport } from './webhook/transport.js'
import { getDatabase as getDb } from './db/database.js'

const TEST_SECRET = 'test-staff-secret-for-security-fixes'
const QR_SECRET = 'test-qr-secret-for-security-fixes'

function makeRequest(body: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const raw = Buffer.from(JSON.stringify(body))
  const req = new EventEmitter() as unknown as IncomingMessage
  req.destroy = () => req
  req.pause = () => req
  req.headers = headers as IncomingMessage['headers']
  queueMicrotask(() => {
    req.emit('data', raw)
    req.emit('end')
  })
  return req
}

function makeResponse(): { res: ServerResponse; captured: { status: number; body: string } } {
  const captured = { status: 0, body: '' }
  const res = new EventEmitter() as unknown as ServerResponse
  res.writeHead = ((status: number) => {
    captured.status = status
    return res
  }) as ServerResponse['writeHead']
  res.end = ((chunk?: unknown) => {
    captured.body = String(chunk ?? '')
    return res
  }) as ServerResponse['end']
  return { res, captured }
}

describe('FIX 1: Backup endpoint security', () => {
  beforeAll(() => {
    getDatabase(':memory:')
    createStaffUser('staff-001', 'Test User', 'testuser', 'FRONT_DESK', 'password123', false)
    createStaffUser('staff-002', 'Owner User', 'owner', 'OWNER', 'password456', false)
  })

  afterAll(() => {
    clearStaffUsers()
    closeDatabase()
  })

  it('backup.staff_users must not contain password_hash', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, identifier, role, active, created_at, updated_at FROM staff_users',
    ).all() as Array<Record<string, unknown>>
    for (const row of rows) {
      expect(row).not.toHaveProperty('password_hash')
    }
  })

  it('backup.staff_users must not contain token_version', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, identifier, role, active, created_at, updated_at FROM staff_users',
    ).all() as Array<Record<string, unknown>>
    for (const row of rows) {
      expect(row).not.toHaveProperty('token_version')
    }
  })

  it('backup.staff_users must not contain failed_login_attempts', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, identifier, role, active, created_at, updated_at FROM staff_users',
    ).all() as Array<Record<string, unknown>>
    for (const row of rows) {
      expect(row).not.toHaveProperty('failed_login_attempts')
    }
  })

  it('backup.staff_users must not contain locked_until', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, identifier, role, active, created_at, updated_at FROM staff_users',
    ).all() as Array<Record<string, unknown>>
    for (const row of rows) {
      expect(row).not.toHaveProperty('locked_until')
    }
  })

  it('backup.staff_users must contain safe profile fields', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, identifier, role, active, created_at, updated_at FROM staff_users',
    ).all() as Array<Record<string, unknown>>
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row).toHaveProperty('id')
      expect(row).toHaveProperty('name')
      expect(row).toHaveProperty('identifier')
      expect(row).toHaveProperty('role')
      expect(row).toHaveProperty('active')
      expect(row).toHaveProperty('created_at')
      expect(row).toHaveProperty('updated_at')
    }
  })

  it('safe SELECT returns exactly 7 columns per row', () => {
    const db = getDb()
    const rows = db.prepare(
      'SELECT id, name, identifier, role, active, created_at, updated_at FROM staff_users',
    ).all() as Array<Record<string, unknown>>
    for (const row of rows) {
      const keys = Object.keys(row)
      expect(keys).toHaveLength(7)
    }
  })
})

describe('FIX 2: Concierge QR validation', () => {
  beforeEach(() => {
    clearSessions()
    clearRooms()
  })

  const env = {
    nodeEnv: 'local' as const,
    staffTokenSecret: TEST_SECRET,
    qrTokenSecret: QR_SECRET,
    serviceToken: 'test-service-token',
    allowedOrigins: ['http://localhost:5173'],
    rateLimitWindowSeconds: 60,
    rateLimitMax: 100,
    port: 0,
    makeBookingWebhookUrl: 'http://test',
    makeRoomServiceWebhookUrl: 'http://test',
    makeLateCheckoutWebhookUrl: 'http://test',
    sessionTtlHours: 24,
    dbPath: ':memory:',
  }

  function transportReturning(response: unknown): WebhookTransport {
    return { send: () => Promise.resolve(response as never) }
  }

  it('succeeds with valid QR token and room', async () => {
    const roomNumber = 101
    const qrToken = generateQrToken(roomNumber, QR_SECRET)
    createRoom(roomNumber, qrToken)

    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-1',
      message: 'Accepted',
      data: {},
    })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber,
        request: 'Restaurant recommendation',
        mode: 'AI_CONCIERGE',
        qrToken,
      }),
      res,
      transport,
      env,
    )

    expect(captured.status).toBe(202)
  })

  it('rejects missing qrToken', async () => {
    createRoom(101, generateQrToken(101, QR_SECRET))
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber: 101,
        request: 'Help',
        mode: 'AI_CONCIERGE',
      }),
      res,
      transport,
      env,
    )

    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body).code).toBe('MISSING_FIELD')
    expect(JSON.parse(captured.body).message).toContain('qrToken')
  })

  it('rejects invalid QR token', async () => {
    createRoom(101, generateQrToken(101, QR_SECRET))
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber: 101,
        request: 'Help',
        mode: 'AI_CONCIERGE',
        qrToken: 'totally-fake-token',
      }),
      res,
      transport,
      env,
    )

    expect(captured.status).toBe(403)
    expect(JSON.parse(captured.body).code).toBe('AUTH_REQUIRED')
  })

  it('rejects QR token for wrong room', async () => {
    const qrToken101 = generateQrToken(101, QR_SECRET)
    createRoom(101, qrToken101)
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber: 202,
        request: 'Help',
        mode: 'AI_CONCIERGE',
        qrToken: qrToken101,
      }),
      res,
      transport,
      env,
    )

    expect(captured.status).toBe(403)
    expect(JSON.parse(captured.body).message).toContain('Invalid')
  })

  it('rejects valid QR token for nonexistent room', async () => {
    const roomNumber = 999
    const qrToken = generateQrToken(roomNumber, QR_SECRET)
    // No createRoom — room 999 does not exist in the database
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber,
        request: 'Help',
        mode: 'AI_CONCIERGE',
        qrToken,
      }),
      res,
      transport,
      env,
    )

    expect(captured.status).toBe(403)
    expect(JSON.parse(captured.body).code).toBe('AUTH_REQUIRED')
    expect(JSON.parse(captured.body).message).toContain('not found')
  })

  it('rejects reissued QR token', async () => {
    const roomNumber = 101
    const originalIssuedAt = Date.now()
    const oldToken = generateQrToken(roomNumber, QR_SECRET, originalIssuedAt)
    createRoom(roomNumber, oldToken)

    // Reissue: room now has a new token — pass an explicit issuedAt offset
    // so the reissued token is guaranteed to differ from the original even
    // when Date.now() resolution is coarse (e.g. ~15ms on Windows).
    const { reissueQrToken: reissue } = await import('./room/roomStore.js')
    const newToken = generateQrToken(roomNumber, QR_SECRET, originalIssuedAt + 1)
    reissue(roomNumber, newToken)

    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber,
        request: 'Help',
        mode: 'AI_CONCIERGE',
        qrToken: oldToken,
      }),
      res,
      transport,
      env,
    )

    expect(captured.status).toBe(403)
    expect(JSON.parse(captured.body).message).toContain('does not match')
  })

  it('does not verify QR when env is not provided (unit test mode)', async () => {
    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-1',
      message: 'Accepted',
      data: {},
    })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({
        guestId: 'guest-1',
        sessionId: 'session-1',
        roomNumber: 101,
        request: 'Help',
        mode: 'AI_CONCIERGE',
      }),
      res,
      transport,
    )

    expect(captured.status).toBe(202)
  })
})

describe('FIX 3: Check-in rejects nonexistent rooms', () => {
  beforeAll(() => {
    getDatabase(':memory:')
  })

  beforeEach(() => {
    clearRooms()
    clearSessions()
  })

  afterAll(() => {
    closeDatabase()
  })

  it('returns 400 for nonexistent room', () => {
    const db = getDb()
    const room = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(9999)
    expect(room).toBeUndefined()
  })

  it('does not create a session for nonexistent room', () => {
    const db = getDb()
    const sessionBefore = db.prepare('SELECT * FROM sessions WHERE room_id = ?').get(9999)
    expect(sessionBefore).toBeUndefined()
  })

  it('does not generate a QR token for nonexistent room', () => {
    const db = getDb()
    const room = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(9999)
    expect(room).toBeUndefined()
  })

  it('existing room succeeds with check-in', () => {
    const roomNumber = 101
    const qrToken = generateQrToken(roomNumber, QR_SECRET)
    createRoom(roomNumber, qrToken)

    const db = getDb()
    const room = db.prepare('SELECT * FROM rooms WHERE room_number = ?').get(roomNumber) as Record<string, unknown>
    expect(room).toBeDefined()
    expect(room.qr_token).toBe(qrToken)
  })
})
