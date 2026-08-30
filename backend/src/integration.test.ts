import http, { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { handleConcierge, handleRoomService, handleLateCheckout } from './routes/handler.js'
import { createMockTransport } from './webhook/mockTransport.js'
import { isAuthorized } from './middleware/auth.js'
import { createRateLimiter, type RateLimiter } from './middleware/rateLimit.js'
import { generateQrToken } from './session/qrToken.js'
import { checkIn, clearSessions } from './session/store.js'
import type { EnvConfig } from './config/env.js'

const env: EnvConfig = {
  port: 0,
  nodeEnv: 'local',
  serviceToken: 'test-integration-secret',
  rateLimitWindowSeconds: 60,
  rateLimitMax: 30,
  allowedOrigins: ['http://localhost:5173'],
  makeBookingWebhookUrl: 'https://hook.make.com/bk',
  makeRoomServiceWebhookUrl: 'https://hook.make.com/rs',
  makeLateCheckoutWebhookUrl: 'https://hook.make.com/lc',
  qrTokenSecret: 'test-qr-secret',
  sessionTtlHours: 24,
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, { status: 'ok' })
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
    handleHealth(req, res)
    return
  }

  if (method === 'POST' && url === '/api/concierge') {
    if (authorizePost(req, res, e, limiter)) {
      void handleConcierge(req, res, transport)
    }
    return
  }

  if (method === 'POST' && url === '/api/room-service') {
    if (authorizePost(req, res, e, limiter)) {
      void handleRoomService(req, res, transport, e)
    }
    return
  }

  if (method === 'POST' && url === '/api/late-checkout') {
    if (authorizePost(req, res, e, limiter)) {
      void handleLateCheckout(req, res, transport, e)
    }
    return
  }

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
  const guestId = body.guestId as string | undefined
  const sessionId = body.sessionId as string | undefined
  if (typeof roomId !== 'number' || !Number.isInteger(roomId) || roomId < 1 || roomId > 9999 ||
      typeof guestId !== 'string' || guestId.trim() === '' ||
      typeof sessionId !== 'string' || sessionId.trim() === '') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Validation failed', code: 'MISSING_FIELD' })
    return
  }
  const ttlMs = e.sessionTtlHours * 60 * 60 * 1000
  checkIn(roomId, guestId, sessionId, ttlMs)
  const qrToken = generateQrToken(roomId, e.qrTokenSecret)
  sendJson(res, 200, { status: 'ok', requestId: crypto.randomUUID(), message: 'Guest checked in', data: { roomId, guestId, sessionId, qrToken } })
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
  const roomId = verifyQrToken(qrToken, e.qrTokenSecret)
  if (roomId === undefined) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Invalid QR token', code: 'AUTH_REQUIRED' })
    return
  }
  const session = getSession(roomId)
  if (!session) {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'No active session', code: 'AUTH_REQUIRED' })
    return
  }
  sendJson(res, 200, { status: 'ok', requestId: crypto.randomUUID(), message: 'Session valid', data: { roomId: session.roomId, guestId: session.guestId, sessionId: session.sessionId, expiresAt: new Date(session.expiresAt).toISOString() } })
}

let server: ReturnType<typeof createServer>
let baseUrl: string

beforeAll(async () => {
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
  it('returns 401 AUTH_REQUIRED on /api/concierge', async () => {
    const res = await request('POST', '/api/concierge', {}, validConciergePayload)
    expect(res.status).toBe(401)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('returns 401 AUTH_REQUIRED on /api/room-service', async () => {
    const res = await request('POST', '/api/room-service', {})
    expect(res.status).toBe(401)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('returns 401 AUTH_REQUIRED on /api/late-checkout', async () => {
    const res = await request('POST', '/api/late-checkout', {})
    expect(res.status).toBe(401)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })
})

describe('POST with wrong Bearer token', () => {
  it('returns 401 AUTH_REQUIRED', async () => {
    const res = await request('POST', '/api/concierge', {
      Authorization: 'Bearer wrong-token-value',
    }, validConciergePayload)
    expect(res.status).toBe(401)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('rejects Basic scheme instead of Bearer', async () => {
    const res = await request('POST', '/api/concierge', {
      Authorization: 'Basic dXNlcjpwYXNz',
    }, validConciergePayload)
    expect(res.status).toBe(401)
  })
})

describe('POST with correct token reaches handler', () => {
  it('passes auth and returns 202 from /api/concierge', async () => {
    const res = await request('POST', '/api/concierge', {
      Authorization: `Bearer ${TOKEN}`,
    }, validConciergePayload)
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
    expect(body.requestId).toMatch(/^mock-/)
  })

  it('passes auth and returns 202 from /api/room-service', async () => {
    const roomServicePayload = {
      guestId: 'guest-123',
      sessionId: 'session-456',
      roomNumber: 214,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      mode: 'QR_ROOM_SERVICE',
    }
    const res = await request('POST', '/api/room-service', {
      Authorization: `Bearer ${TOKEN}`,
    }, roomServicePayload)
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
  })

  it('passes auth and returns 202 from /api/late-checkout', async () => {
    const lateCheckoutPayload = {
      guestId: 'guest-123',
      sessionId: 'session-456',
      roomNumber: 214,
      requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      mode: 'LATE_CHECKOUT',
    }
    const res = await request('POST', '/api/late-checkout', {
      Authorization: `Bearer ${TOKEN}`,
    }, lateCheckoutPayload)
    expect(res.status).toBe(202)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('accepted')
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
  it('check-in creates a session and returns a QR token', async () => {
    const res = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304, guestId: 'guest-1', sessionId: 'session-1' })

    expect(res.status).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('ok')
    expect(body.data.roomId).toBe(304)
    expect(body.data.qrToken).toBeDefined()
  })

  it('verify returns session details for a valid QR token', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304, guestId: 'guest-1', sessionId: 'session-1' })
    const qrToken = JSON.parse(checkInRes.body).data.qrToken

    const verifyRes = await request('POST', '/api/session/verify', {
      Authorization: `Bearer ${TOKEN}`,
    }, { qrToken })

    expect(verifyRes.status).toBe(200)
    const body = JSON.parse(verifyRes.body)
    expect(body.data.roomId).toBe(304)
    expect(body.data.guestId).toBe('guest-1')
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
    }, { roomNumber: 304, guestId: 'guest-1', sessionId: 'session-1' })
    const qrToken = JSON.parse(checkInRes.body).data.qrToken

    const res = await request('POST', '/api/room-service', {
      Authorization: `Bearer ${TOKEN}`,
    }, {
      guestId: 'guest-1',
      sessionId: 'session-1',
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
    }, { roomNumber: 304, guestId: 'guest-1', sessionId: 'session-1' })
    const qrToken = JSON.parse(checkInRes.body).data.qrToken

    const res = await request('POST', '/api/room-service', {
      Authorization: `Bearer ${TOKEN}`,
    }, {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 305,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res.status).toBe(403)
    expect(JSON.parse(res.body).code).toBe('AUTH_REQUIRED')
  })

  it('rejects room-service with no active session', async () => {
    const qrToken = generateQrToken(304, env.qrTokenSecret)

    const res = await request('POST', '/api/room-service', {
      Authorization: `Bearer ${TOKEN}`,
    }, {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 304,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken,
      mode: 'QR_ROOM_SERVICE',
    })
    expect(res.status).toBe(403)
  })
})

describe('Session verification on Late Checkout', () => {
  it('accepts late-checkout with a valid QR token and active session', async () => {
    const checkInRes = await request('POST', '/api/session/check-in', {
      Authorization: `Bearer ${TOKEN}`,
    }, { roomNumber: 304, guestId: 'guest-1', sessionId: 'session-1' })
    const qrToken = JSON.parse(checkInRes.body).data.qrToken

    const res = await request('POST', '/api/late-checkout', {
      Authorization: `Bearer ${TOKEN}`,
    }, {
      guestId: 'guest-1',
      sessionId: 'session-1',
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
    }, { roomNumber: 304, guestId: 'guest-1', sessionId: 'session-1' })
    const qrToken = JSON.parse(checkInRes.body).data.qrToken

    const res = await request('POST', '/api/late-checkout', {
      Authorization: `Bearer ${TOKEN}`,
    }, {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 305,
      requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      qrToken,
      mode: 'LATE_CHECKOUT',
    })
    expect(res.status).toBe(403)
  })
})
