import http, { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { handleConcierge, handleRoomService, handleLateCheckout, handleOrderStatus, handleUpdateOrderStatus } from './routes/handler.js'
import { createMockTransport } from './webhook/mockTransport.js'
import { isAuthorized } from './middleware/auth.js'
import { createRateLimiter, type RateLimiter } from './middleware/rateLimit.js'
import { createIdempotencyStore } from './middleware/idempotency.js'
import { generateQrToken } from './session/qrToken.js'
import { checkIn, clearSessions } from './session/store.js'
import { clearOrders } from './order/store.js'
import { getDatabase } from './db/database.js'
import type { EnvConfig } from './config/env.js'

const env: EnvConfig = {
  port: 0,
  nodeEnv: 'local',
  serviceToken: 'test-integration-secret',
  rateLimitWindowSeconds: 60,
  rateLimitMax: 200,
  allowedOrigins: ['http://localhost:5173'],
  makeBookingWebhookUrl: 'https://hook.make.com/bk',
  makeRoomServiceWebhookUrl: 'https://hook.make.com/rs',
  makeLateCheckoutWebhookUrl: 'https://hook.make.com/lc',
  qrTokenSecret: 'test-qr-secret',
  sessionTtlHours: 24,
  dbPath: ':memory:',
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function handleHealth(_req: IncomingMessage, res: ServerResponse, env: EnvConfig): void {
  let databaseReachable = false
  try {
    const db = getDatabase()
    db.prepare('SELECT 1').get()
    databaseReachable = true
  } catch {
    // DB check failed
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Backend healthy',
    data: {
      service: 'backend',
      version: '0.1.0',
      environment: env.nodeEnv,
      databaseReachable,
      uptime: Math.floor(process.uptime()),
    },
  })
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  e: EnvConfig,
): boolean {
  const origin = req.headers.origin
  if (origin === undefined || !e.allowedOrigins.includes(origin)) {
    return false
  }
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '600')
  return true
}

function authorizePost(
  req: IncomingMessage,
  res: ServerResponse,
  e: EnvConfig,
  limiter: RateLimiter,
): boolean {
  if (!isAuthorized(req, e)) {
    sendJson(res, 401, {
      status: 'error',
      requestId: crypto.randomUUID(),
      message: 'Authentication required',
      code: 'AUTH_REQUIRED',
    })
    return false
  }
  if (!limiter.consume(clientKey(req))) {
    sendJson(res, 429, {
      status: 'error',
      requestId: crypto.randomUUID(),
      message: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    })
    return false
  }
  return true
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 4096) { req.pause(); reject(new Error('too large')); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

const transport = createMockTransport()
const idempotencyStore = createIdempotencyStore()

function route(
  req: IncomingMessage,
  res: ServerResponse,
  e: EnvConfig,
  limiter: RateLimiter,
): void {
  const { method, url } = req

  const corsApplied = applyCorsHeaders(req, res, e)

  if (method === 'OPTIONS' && corsApplied) {
    res.writeHead(204).end()
    return
  }

  if (method === 'GET' && url === '/api/health') {
    handleHealth(req, res, e)
    return
  }

  // Guest routes: rate-limited only, no SERVICE_TOKEN required
  if (method === 'POST' && url === '/api/concierge') {
    if (!limiter.consume(clientKey(req))) {
      sendJson(res, 429, {
        status: 'error',
        requestId: crypto.randomUUID(),
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      })
      return
    }
    void handleConcierge(req, res, transport)
    return
  }

  if (method === 'POST' && url === '/api/room-service') {
    if (!limiter.consume(clientKey(req))) {
      sendJson(res, 429, {
        status: 'error',
        requestId: crypto.randomUUID(),
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      })
      return
    }
    void handleRoomService(req, res, transport, e, idempotencyStore)
    return
  }

  if (method === 'POST' && url === '/api/late-checkout') {
    if (!limiter.consume(clientKey(req))) {
      sendJson(res, 429, {
        status: 'error',
        requestId: crypto.randomUUID(),
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      })
      return
    }
    void handleLateCheckout(req, res, transport, e)
    return
  }

  if (method === 'POST' && url === '/api/guest/init') {
    if (!limiter.consume(clientKey(req))) {
      sendJson(res, 429, {
        status: 'error',
        requestId: crypto.randomUUID(),
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      })
      return
    }
    void handleGuestInit(req, res, e)
    return
  }

  // Admin routes: SERVICE_TOKEN required
  if (method === 'POST' && url === '/api/session/check-in') {
    if (!authorizePost(req, res, e, limiter)) return
    void handleCheckIn(req, res, e)
    return
  }

  if (method === 'POST' && url === '/api/session/verify') {
    if (!authorizePost(req, res, e, limiter)) return
    void handleVerifySession(req, res, e)
    return
  }

  // Order status query (guest-authenticated via QR token + session)
  if (method === 'POST' && url === '/api/order/status') {
    if (!limiter.consume(clientKey(req))) {
      sendJson(res, 429, {
        status: 'error',
        requestId: crypto.randomUUID(),
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
      })
      return
    }
    void handleOrderStatus(req, res, e)
    return
  }

  // Order status update (admin Bearer-protected)
  if (method === 'POST' && url === '/api/order/update-status') {
    if (!authorizePost(req, res, e, limiter)) return
    void handleUpdateOrderStatus(req, res)
    return
  }

  sendJson(res, 404, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Route not found',
    code: 'NOT_FOUND',
  })
}

async function handleCheckIn(
  req: IncomingMessage,
  res: ServerResponse,
  e: EnvConfig,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid JSON', code: 'INVALID_REQUEST' })
    return
  }
  const roomId = body.roomNumber as number | undefined
  if (typeof roomId !== 'number' || !Number.isInteger(roomId) || roomId < 1 || roomId > 9999) {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Validation failed', code: 'MISSING_FIELD' })
    return
  }

  // Server-generate cryptographically secure guestId and sessionId
  const guestId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()

  const ttlMs = e.sessionTtlHours * 60 * 60 * 1000
  checkIn(roomId, guestId, sessionId, ttlMs)
  const qrToken = generateQrToken(roomId, e.qrTokenSecret)
  sendJson(res, 200, { status: 'ok', requestId: crypto.randomUUID(), message: 'Guest checked in', data: { roomId, guestId, sessionId, qrToken } })
}

async function handleGuestInit(
  req: IncomingMessage,
  res: ServerResponse,
  e: EnvConfig,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid JSON', code: 'INVALID_REQUEST' })
    return
  }

  const qrToken = body.qrToken as string | undefined
  const roomNumber = body.roomNumber as number | undefined

  if (typeof qrToken !== 'string' || qrToken.trim() === '') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'qrToken required', code: 'MISSING_FIELD' })
    return
  }

  const { verifyQrToken } = await import('./session/qrToken.js')
  const { getSession, checkIn: storeCheckIn } = await import('./session/store.js')
  const { getRoomByNumber } = await import('./room/roomStore.js')

  const tokenResult = verifyQrToken(qrToken, e.qrTokenSecret)
  if (tokenResult === undefined) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Invalid or expired QR token', code: 'AUTH_REQUIRED' })
    return
  }

  const verifiedRoomId = tokenResult.roomId

  // If a roomNumber was provided (legacy QR URLs), reject mismatches
  if (
    typeof roomNumber === 'number' && Number.isInteger(roomNumber) &&
    roomNumber >= 1 && roomNumber <= 9999 &&
    roomNumber !== verifiedRoomId
  ) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'QR token room mismatch', code: 'AUTH_REQUIRED' })
    return
  }

  const room = getRoomByNumber(verifiedRoomId)
  if (room && !room.active) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Room is not active', code: 'AUTH_REQUIRED' })
    return
  }
  if (room && room.qrToken !== qrToken) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'QR token does not match room', code: 'AUTH_REQUIRED' })
    return
  }

  const existingSession = getSession(verifiedRoomId)
  if (existingSession) {
    sendJson(res, 200, { status: 'ok', requestId: crypto.randomUUID(), message: 'Session active', data: { roomId: existingSession.roomId, guestId: existingSession.guestId, sessionId: existingSession.sessionId, expiresAt: new Date(existingSession.expiresAt).toISOString() } })
    return
  }

  const guestId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  const ttlMs = e.sessionTtlHours * 60 * 60 * 1000
  const session = storeCheckIn(verifiedRoomId, guestId, sessionId, ttlMs)
  sendJson(res, 200, { status: 'ok', requestId: crypto.randomUUID(), message: 'Session created', data: { roomId: session.roomId, guestId: session.guestId, sessionId: session.sessionId, expiresAt: new Date(session.expiresAt).toISOString() } })
}

async function handleVerifySession(
  req: IncomingMessage,
  res: ServerResponse,
  e: EnvConfig,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid JSON', code: 'INVALID_REQUEST' })
    return
  }
  const qrToken = body.qrToken as string | undefined
  if (typeof qrToken !== 'string' || qrToken.trim() === '') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'qrToken required', code: 'MISSING_FIELD' })
    return
  }
  const { verifyQrToken } = await import('./session/qrToken.js')
  const { getSession } = await import('./session/store.js')
  const tokenResult = verifyQrToken(qrToken, e.qrTokenSecret)
  if (tokenResult === undefined) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Invalid QR token', code: 'AUTH_REQUIRED' })
    return
  }
  const session = getSession(tokenResult.roomId)
  if (!session) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'No active session', code: 'AUTH_REQUIRED' })
    return
  }
  sendJson(res, 200, { status: 'ok', requestId: crypto.randomUUID(), message: 'Session valid', data: { roomId: session.roomId, guestId: session.guestId, sessionId: session.sessionId, expiresAt: new Date(session.expiresAt).toISOString() } })
}

let server: ReturnType<typeof createServer>
let baseUrl: string

beforeAll(async () => {
  getDatabase(':memory:')
  const limiter = createRateLimiter(env.rateLimitWindowSeconds, env.rateLimitMax)
  server = createServer((req, res) => route(req, res, env, limiter))
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`
      }
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  clearSessions()
  clearOrders()
})

function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl)
    const reqOpts = {
      hostname: '127.0.0.1',
      port: Number(new URL(baseUrl).port),
      path: url.pathname,
      method,
      headers,
    }
    const req = http.request(reqOpts, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers as Record<string, string>,
          body: Buffer.concat(chunks).toString(),
        })
      })
    })
    req.on('error', reject)
    if (body !== undefined) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

const validConciergePayload = {
  guestId: 'guest-123',
  sessionId: 'session-456',
  roomNumber: 214,
  request: 'Restaurant recommendations',
  mode: 'AI_CONCIERGE',
}

const TOKEN = env.serviceToken

describe('POST without Authorization', () => {
  it('returns 401 AUTH_REQUIRED on /api/session/check-in (admin route)', async () => {
    const res = await request('POST', '/api/session/check-in', {}, { roomNumber: 304 })
    expect(res.status).toBe(401)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('guest routes do not require SERVICE_TOKEN (rate-limited only)', async () => {
    const res = await request('POST', '/api/concierge', {}, validConciergePayload)
    // Guest routes accept without Bearer token (just validation + rate limit)
    expect(res.status).not.toBe(401)
  })

  it('guest routes are rate-limited without SERVICE_TOKEN', async () => {
    const res = await request('POST', '/api/concierge', {}, validConciergePayload)
    // Guest routes accept without Bearer token; rate limit still applies
    expect(res.status).toBe(202)
  })
})

describe('POST with wrong Bearer token', () => {
  it('returns 401 on admin route /api/session/check-in', async () => {
    const res = await request('POST', '/api/session/check-in', {
      Authorization: 'Bearer wrong-token-value',
    }, { roomNumber: 304 })
    expect(res.status).toBe(401)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('rejects Basic scheme instead of Bearer on admin route', async () => {
    const res = await request('POST', '/api/session/check-in', {
      Authorization: 'Basic dXNlcjpwYXNz',
    }, { roomNumber: 304 })
    expect(res.status).toBe(401)
  })
})

describe('POST with correct token reaches handler', () => {
  it('guest routes accept requests without SERVICE_TOKEN', async () => {
    const res = await request('POST', '/api/concierge', {}, validConciergePayload)
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
    expect(body.requestId).toMatch(/^mock-/)
  })

  it('guest room-service requires qrToken but not SERVICE_TOKEN', async () => {
    const qrToken = generateQrToken(214, env.qrTokenSecret)
    const roomServicePayload = {
      guestId: 'guest-123',
      sessionId: 'session-456',
      roomNumber: 214,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    }
    const res = await request('POST', '/api/room-service', {}, roomServicePayload)
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
  })

  it('guest late-checkout requires qrToken but not SERVICE_TOKEN', async () => {
    const qrToken = generateQrToken(214, env.qrTokenSecret)
    const lateCheckoutPayload = {
      guestId: 'guest-123',
      sessionId: 'session-456',
      roomNumber: 214,
      requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      qrToken,
      mode: 'LATE_CHECKOUT',
    }
    const res = await request('POST', '/api/late-checkout', {}, lateCheckoutPayload)
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
  })

  it('room-service rejects request without qrToken', async () => {
    const roomServicePayload = {
      guestId: 'guest-123',
      sessionId: 'session-456',
      roomNumber: 214,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      mode: 'QR_ROOM_SERVICE',
    }
    const res = await request('POST', '/api/room-service', {}, roomServicePayload)
    expect(res.status).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.code).toBe('MISSING_FIELD')
  })

  it('late-checkout rejects request without qrToken', async () => {
    const lateCheckoutPayload = {
      guestId: 'guest-123',
      sessionId: 'session-456',
      roomNumber: 214,
      requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      mode: 'LATE_CHECKOUT',
    }
    const res = await request('POST', '/api/late-checkout', {}, lateCheckoutPayload)
    expect(res.status).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.code).toBe('MISSING_FIELD')
  })

  it('admin route /api/session/check-in still requires SERVICE_TOKEN', async () => {
    const res = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
  })
})

describe('CORS', () => {
  it('returns Access-Control-Allow-Origin for an allowed origin', async () => {
    const res = await request('POST', '/api/concierge', {
      Origin: 'http://localhost:5173',
      Authorization: `Bearer ${TOKEN}`,
    }, validConciergePayload)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(res.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS')
    expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Authorization')
    expect(res.headers['access-control-max-age']).toBe('600')
  })

  it('does NOT set Access-Control-Allow-Origin for an unapproved origin', async () => {
    const res = await request('POST', '/api/concierge', {
      Origin: 'https://evil.example.com',
      Authorization: `Bearer ${TOKEN}`,
    }, validConciergePayload)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('does NOT set CORS headers when Origin is missing', async () => {
    const res = await request('POST', '/api/concierge', {
      Authorization: `Bearer ${TOKEN}`,
    }, validConciergePayload)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('OPTIONS preflight', () => {
  it('returns 204 with CORS headers from an allowed origin', async () => {
    const res = await request('OPTIONS', '/api/concierge', {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
    })
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173')
  })

  it('returns 404 from an unapproved origin (no CORS match)', async () => {
    const res = await request('OPTIONS', '/api/concierge', {
      Origin: 'https://evil.example.com',
      'Access-Control-Request-Method': 'POST',
    })
    expect(res.status).toBe(404)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

describe('Rate limiting', () => {
  it('returns 429 RATE_LIMITED when limit is exceeded', async () => {
    const limitedEnv: EnvConfig = { ...env, rateLimitMax: 2 }
    const limiter = createRateLimiter(limitedEnv.rateLimitWindowSeconds, limitedEnv.rateLimitMax)

    const testServer = createServer((req, res) => route(req, res, limitedEnv, limiter))
    await new Promise<void>((resolve) => testServer.listen(0, resolve))
    const addr = testServer.address()
    const port = addr && typeof addr === 'object' ? addr.port : 0
    const testUrl = `http://127.0.0.1:${port}`

    const doRequest = (n: number) =>
      new Promise<{ status: number; body: string }>((resolve, reject) => {
        const urlObj = new URL('/api/concierge', testUrl)
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
              Authorization: `Bearer ${TOKEN}`,
            },
          },
          (res: IncomingMessage) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () =>
              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
            )
          },
        )
        req.on('error', reject)
        req.write(JSON.stringify({ ...validConciergePayload, request: `req-${n}` }))
        req.end()
      })

    const r1 = await doRequest(1)
    expect(r1.status).toBe(202)

    const r2 = await doRequest(2)
    expect(r2.status).toBe(202)

    const r3 = await doRequest(3)
    expect(r3.status).toBe(429)
    expect(JSON.parse(r3.body).code).toBe('RATE_LIMITED')

    await new Promise<void>((resolve) => testServer.close(() => resolve()))
  })
})

describe('404 for unknown routes', () => {
  it('returns 404 NOT_FOUND for unknown POST path', async () => {
    const res = await request('POST', '/api/unknown', {
      Authorization: `Bearer ${TOKEN}`,
    }, {})
    expect(res.status).toBe(404)
    expect(JSON.parse(res.body).code).toBe('NOT_FOUND')
  })

  it('returns 404 NOT_FOUND for unknown GET path', async () => {
    const res = await request('GET', '/api/unknown')
    expect(res.status).toBe(404)
  })
})

describe('Session check-in and verify', () => {
  it('check-in creates a session and returns a QR token (server-generated IDs)', async () => {
    const res = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })

    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.data.roomId).toBe(304)
    expect(body.data.qrToken).toBeDefined()
    expect(body.data.guestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.data.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('check-in rejects client-supplied guestId and sessionId', async () => {
    const res = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304, guestId: 'client-guest', sessionId: 'client-session' })

    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    // Server should generate its own IDs, ignoring client values
    expect(body.data.guestId).not.toBe('client-guest')
    expect(body.data.sessionId).not.toBe('client-session')
    expect(body.data.guestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.data.sessionId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('verify returns session details for a valid QR token', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const qrToken = JSON.parse(checkInRes.body).data.qrToken

    const verifyRes = await request('POST', '/api/session/verify', {
      Authorization: `Bearer ${TOKEN}`,
    }, { qrToken })

    expect(verifyRes.status).toBe(200)
    const body = JSON.parse(verifyRes.body)
    expect(body.data.roomId).toBe(304)
    expect(body.data.guestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('verify rejects an invalid QR token', async () => {
    const res = await request('POST', '/api/session/verify', {
      Authorization: `Bearer ${TOKEN}`,
    }, { qrToken: 'fake-token' })

    expect(res.status).toBe(403)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })
})

describe('Session verification on Room Service', () => {
  it('accepts room-service with a valid QR token and active session', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)
    const qrToken = checkInBody.data.qrToken
    const guestId = checkInBody.data.guestId
    const sessionId = checkInBody.data.sessionId

    const res = await request('POST', '/api/room-service', {}, {
      guestId,
      sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res.status).toBe(202)
  })

  it('rejects room-service with a QR token for a different room', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)
    const qrToken = checkInBody.data.qrToken

    const res = await request('POST', '/api/room-service', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 305,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res.status).toBe(403)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('auto-creates session and returns new credentials when session is missing', async () => {
    const { generateQrToken: gen } = await import('./session/qrToken.js')
    const qrToken = gen(304, env.qrTokenSecret)

    const res = await request('POST', '/api/room-service', {}, {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    // QR token proves room identity — session is auto-created on-the-fly
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    // Backend must return the fresh server-generated credentials so the
    // frontend can update its stored guestId/sessionId.
    expect(body.data.guestId).toBeDefined()
    expect(body.data.sessionId).toBeDefined()
    expect(body.data.guestId).not.toBe('guest-1')
    expect(body.data.sessionId).not.toBe('session-1')
  })

  it('subsequent request after recovery uses new credentials', async () => {
    const { generateQrToken: gen } = await import('./session/qrToken.js')
    const qrToken = gen(304, env.qrTokenSecret)

    // First request: session missing, recovery creates new credentials
    const res1 = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': crypto.randomUUID(),
    }, {
      guestId: 'guest-old',
      sessionId: 'session-old',
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res1.status).toBe(202)
    const body1 = JSON.parse(res1.body)
    const newGuestId = body1.data.guestId as string
    const newSessionId = body1.data.sessionId as string

    // Second request: use the new credentials returned from recovery
    const res2 = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': crypto.randomUUID(),
    }, {
      guestId: newGuestId,
      sessionId: newSessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res2.status).toBe(202)
    const body2 = JSON.parse(res2.body)
    // Second request should NOT trigger another recovery — same credentials returned
    expect(body2.data.guestId).toBe(newGuestId)
    expect(body2.data.sessionId).toBe(newSessionId)
  })

  it('rejects room-service with expired QR token', async () => {
    const { generateQrToken: gen } = await import('./session/qrToken.js')
    const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000 // 25 hours ago
    const qrToken = gen(304, env.qrTokenSecret, oldTimestamp)

    // Create a session so only the QR token is the issue
    await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })

    const res = await request('POST', '/api/room-service', {}, {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res.status).toBe(403)
  })

  it('deduplicates room-service with the same idempotency key', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const orderPayload = {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    }
    const idempotencyKey = crypto.randomUUID()

    const res1 = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': idempotencyKey,
    }, orderPayload)
    expect(res1.status).toBe(202)

    const res2 = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': idempotencyKey,
    }, orderPayload)
    expect(res2.status).toBe(202)
    expect(JSON.parse(res1.body).requestId).toBe(JSON.parse(res2.body).requestId)
  })
})

describe('Session verification on Late Checkout', () => {
  it('accepts late-checkout with a valid QR token and active session', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)
    const qrToken = checkInBody.data.qrToken

    const res = await request('POST', '/api/late-checkout', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      qrToken,
      mode: 'LATE_CHECKOUT',
    })
    expect(res.status).toBe(202)
  })

  it('rejects late-checkout with a QR token for a different room', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)
    const qrToken = checkInBody.data.qrToken

    const res = await request('POST', '/api/late-checkout', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 305,
      requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      qrToken,
      mode: 'LATE_CHECKOUT',
    })
    expect(res.status).toBe(403)
  })
})

describe('Order creation via Room Service', () => {
  it('successful room-service order creates an order with status NEW', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const res = await request('POST', '/api/room-service', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
    expect(body.data.orderId).toBeDefined()
    expect(body.data.status).toBe('NEW')
  })

  it('returns stable orderId in response', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const res = await request('POST', '/api/room-service', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    const body = JSON.parse(res.body)
    expect(body.data.orderId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('server-side sanitized items are stored and returned', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const res = await request('POST', '/api/room-service', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Forged Name', quantity: 2, unitPrice: 1 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    const body = JSON.parse(res.body)
    expect(body.data.items[0].name).toBe('Club Sandwich')
    expect(body.data.items[0].unitPrice).toBe(1200)
    expect(body.data.items[0].quantity).toBe(2)
  })

  it('server-side total is correct', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const res = await request('POST', '/api/room-service', {}, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [
        { itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 },
        { itemId: 'menu.010', name: 'Fresh Orange Juice', quantity: 2, unitPrice: 600 },
      ],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    const body = JSON.parse(res.body)
    // 1200 * 1 + 600 * 2 = 2400
    expect(body.data.total).toBe(2400)
  })
})

describe('Order status query (guest-authenticated)', () => {
  async function createOrderAndGetId(): Promise<{ orderId: string; guestId: string; sessionId: string; qrToken: string }> {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const roomServiceRes = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': crypto.randomUUID(),
    }, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    const orderBody = JSON.parse(roomServiceRes.body)

    return {
      orderId: orderBody.data.orderId,
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      qrToken: checkInBody.data.qrToken,
    }
  }

  it('guest can retrieve their own order', async () => {
    const { orderId, guestId, sessionId, qrToken } = await createOrderAndGetId()
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId,
      qrToken,
    })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.orderId).toBe(orderId)
    expect(body.data.status).toBe('NEW')
    expect(body.data.total).toBe(1200)
  })

  it('rejects query with invalid QR token', async () => {
    const { orderId, guestId, sessionId } = await createOrderAndGetId()
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId,
      qrToken: 'fake-token',
    })
    expect(res.status).toBe(403)
  })

  it('rejects query when guestId does not match', async () => {
    const { orderId, sessionId, qrToken } = await createOrderAndGetId()
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId: 'wrong-guest',
      sessionId,
      qrToken,
    })
    expect(res.status).toBe(403)
  })

  it('rejects query when sessionId does not match', async () => {
    const { orderId, guestId, qrToken } = await createOrderAndGetId()
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId: 'wrong-session',
      qrToken,
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 for nonexistent orderId', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const res = await request('POST', '/api/order/status', {}, {
      orderId: '00000000-0000-0000-0000-000000000000',
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      qrToken: checkInBody.data.qrToken,
    })
    expect(res.status).toBe(404)
  })

  it('rejects query for order belonging to a different room', async () => {
    // Create order for room 304
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const roomServiceRes = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': crypto.randomUUID(),
    }, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    const orderId = JSON.parse(roomServiceRes.body).data.orderId

    // Try to query from room 305 with a QR token for room 305
    const checkInRes2 = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 305 })
    const checkInBody2 = JSON.parse(checkInRes2.body)

    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId: checkInBody2.data.guestId,
      sessionId: checkInBody2.data.sessionId,
      qrToken: checkInBody2.data.qrToken,
    })
    expect(res.status).toBe(404)
  })

  it('normal guest cannot access admin update-status endpoint', async () => {
    const { orderId } = await createOrderAndGetId()
    const res = await request('POST', '/api/order/update-status', {}, {
      orderId,
      status: 'PREPARING',
    })
    expect(res.status).toBe(401)
  })
})

describe('Session recovery (order status after session loss)', () => {
  async function createOrderAndGetId(): Promise<{
    orderId: string
    guestId: string
    sessionId: string
    qrToken: string
  }> {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const roomServiceRes = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': crypto.randomUUID(),
    }, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    const orderBody = JSON.parse(roomServiceRes.body)

    return {
      orderId: orderBody.data.orderId,
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      qrToken: checkInBody.data.qrToken,
    }
  }

  it('allows status check after session is deleted (simulates server restart)', async () => {
    const { orderId, guestId, sessionId, qrToken } = await createOrderAndGetId()

    // Delete the session to simulate server restart / data loss
    const db = getDatabase(':memory:')
    db.prepare('DELETE FROM sessions WHERE room_id = ?').run(304)

    // Status check should still work via order ownership recovery
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId,
      qrToken,
    })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.orderId).toBe(orderId)
    expect(body.data.status).toBe('NEW')
  })

  it('rejects status check with wrong guestId after session loss', async () => {
    const { orderId, sessionId, qrToken } = await createOrderAndGetId()

    // Delete the session
    const db = getDatabase(':memory:')
    db.prepare('DELETE FROM sessions WHERE room_id = ?').run(304)

    // Wrong guestId should fail
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId: 'wrong-guest-id',
      sessionId,
      qrToken,
    })
    expect(res.status).toBe(403)
  })

  it('rejects status check with wrong sessionId after session loss', async () => {
    const { orderId, guestId, qrToken } = await createOrderAndGetId()

    // Delete the session
    const db = getDatabase(':memory:')
    db.prepare('DELETE FROM sessions WHERE room_id = ?').run(304)

    // Wrong sessionId should fail
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId: 'wrong-session-id',
      qrToken,
    })
    expect(res.status).toBe(403)
  })

  it('rejects status check for wrong room after session loss', async () => {
    const { orderId, guestId, sessionId } = await createOrderAndGetId()

    // Delete the session
    const db = getDatabase(':memory:')
    db.prepare('DELETE FROM sessions WHERE room_id = ?').run(304)

    // Generate a QR token for a different room
    const wrongQrToken = generateQrToken(305, env.qrTokenSecret)

    // Wrong room QR token should fail
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId,
      qrToken: wrongQrToken,
    })
    expect(res.status).toBe(403)
  })

  it('still allows status check with valid session (normal path)', async () => {
    const { orderId, guestId, sessionId, qrToken } = await createOrderAndGetId()

    // Session still exists - normal path should work
    const res = await request('POST', '/api/order/status', {}, {
      orderId,
      guestId,
      sessionId,
      qrToken,
    })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.orderId).toBe(orderId)
  })
})

describe('Admin order status update', () => {
  async function createOrderAsAdmin(): Promise<string> {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304 })
    const checkInBody = JSON.parse(checkInRes.body)

    const roomServiceRes = await request('POST', '/api/room-service', {
      'X-Idempotency-Key': crypto.randomUUID(),
    }, {
      guestId: checkInBody.data.guestId,
      sessionId: checkInBody.data.sessionId,
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: checkInBody.data.qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    return JSON.parse(roomServiceRes.body).data.orderId
  }

  it('admin can change NEW → PREPARING', async () => {
    const orderId = await createOrderAsAdmin()
    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'PREPARING' })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('PREPARING')
  })

  it('admin can change PREPARING → READY', async () => {
    const orderId = await createOrderAsAdmin()
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'PREPARING' })

    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'READY' })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('READY')
  })

  it('admin can change READY → DELIVERED', async () => {
    const orderId = await createOrderAsAdmin()
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'PREPARING' })
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'READY' })

    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'DELIVERED' })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.status).toBe('DELIVERED')
  })

  it('rejects invalid status value', async () => {
    const orderId = await createOrderAsAdmin()
    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'CANCELLED' })
    expect(res.status).toBe(400)
  })

  it('rejects skipped transition NEW → READY', async () => {
    const orderId = await createOrderAsAdmin()
    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'READY' })
    expect(res.status).toBe(400)
  })

  it('rejects backwards transition PREPARING → NEW', async () => {
    const orderId = await createOrderAsAdmin()
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'PREPARING' })

    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'NEW' })
    expect(res.status).toBe(400)
  })

  it('rejects changes after DELIVERED', async () => {
    const orderId = await createOrderAsAdmin()
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'PREPARING' })
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'READY' })
    await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'DELIVERED' })

    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId, status: 'NEW' })
    expect(res.status).toBe(400)
  })

  it('returns 404 for nonexistent orderId', async () => {
    const res = await request('POST', '/api/order/update-status', {
      Authorization: `Bearer ${TOKEN}`,
    }, { orderId: 'nonexistent', status: 'PREPARING' })
    expect(res.status).toBe(404)
  })

  it('requires Bearer token (no auth = 401)', async () => {
    const orderId = await createOrderAsAdmin()
    const res = await request('POST', '/api/order/update-status', {}, {
      orderId,
      status: 'PREPARING',
    })
    expect(res.status).toBe(401)
  })
})

describe('QR room identity security', () => {
  it('valid QR token returns correct room without roomNumber in request', async () => {
    const qrToken = generateQrToken(101, env.qrTokenSecret)
    const res = await request('POST', '/api/guest/init', {}, { qrToken })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.roomId).toBe(101)
  })

  it('tampered room parameter cannot override token room identity', async () => {
    const qrToken = generateQrToken(101, env.qrTokenSecret)
    // Client tries to claim room 999 but token says 101
    const res = await request('POST', '/api/guest/init', {}, { qrToken, roomNumber: 999 })
    expect(res.status).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.code).toBe('AUTH_REQUIRED')
  })

  it('matching room parameter is accepted for backward compatibility', async () => {
    const qrToken = generateQrToken(101, env.qrTokenSecret)
    const res = await request('POST', '/api/guest/init', {}, { qrToken, roomNumber: 101 })
    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.data.roomId).toBe(101)
  })

  it('invalid QR token is rejected', async () => {
    const res = await request('POST', '/api/guest/init', {}, { qrToken: 'invalid-token' })
    expect(res.status).toBe(403)
    const body = JSON.parse(res.body)
    expect(body.code).toBe('AUTH_REQUIRED')
  })

  it('token for room 101 cannot create session for room 102', async () => {
    const qrToken = generateQrToken(101, env.qrTokenSecret)
    // Room 101 has no active session, so it creates one for room 101
    const res1 = await request('POST', '/api/guest/init', {}, { qrToken })
    expect(res1.status).toBe(200)
    expect(JSON.parse(res1.body).data.roomId).toBe(101)

    // Same token cannot be used to init for room 102
    const res2 = await request('POST', '/api/guest/init', {}, { qrToken, roomNumber: 102 })
    expect(res2.status).toBe(403)
  })
})
