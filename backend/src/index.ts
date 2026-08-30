/**
 * Backend entry point.
 *
 * Reads Make.com webhook URLs from environment variables.
 * Validates configuration at startup before accepting traffic.
 * The Frontend never sees webhook URLs.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { loadEnv } from './config/env.js'
import { handleConcierge, handleRoomService, handleLateCheckout } from './routes/handler.js'
import { createRealTransport } from './webhook/realTransport.js'
import { isAuthorized } from './middleware/auth.js'
import { createRateLimiter, type RateLimiter } from './middleware/rateLimit.js'
import { generateQrToken, verifyQrToken } from './session/qrToken.js'
import { checkIn, getSession } from './session/store.js'
import type { EnvConfig } from './config/env.js'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Backend healthy',
    data: {
      service: 'backend',
      databaseReachable: false,
    },
  })
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? 'unknown'
}

function handleUnauthorized(res: ServerResponse): void {
  sendJson(res, 401, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Authentication required',
    code: 'AUTH_REQUIRED',
  })
}

/**
 * Applies allowlist CORS headers when the request Origin matches
 * ALLOWED_ORIGINS. Origins not on the allowlist receive no CORS headers.
 * Never uses a wildcard and never allows credentials.
 */
function applyCorsHeaders(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
): boolean {
  const origin = req.headers.origin
  if (origin === undefined || !env.allowedOrigins.includes(origin)) {
    return false
  }
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Max-Age', '600')
  return true
}

function handleRateLimited(res: ServerResponse): void {
  sendJson(res, 429, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
  })
}

/** POST routes require a valid Bearer token and fit within the rate budget. */
function authorizePost(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
  limiter: RateLimiter,
): boolean {
  if (!isAuthorized(req, env)) {
    handleUnauthorized(res)
    return false
  }
  if (!limiter.consume(clientKey(req))) {
    handleRateLimited(res)
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
      if (size > 4096) {
        req.pause()
        reject(new Error('too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function route(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
  limiter: RateLimiter,
): void {
  const { method, url } = req

  const corsApplied = applyCorsHeaders(req, res, env)

  if (method === 'OPTIONS' && corsApplied) {
    res.writeHead(204).end()
    return
  }

  if (method === 'GET' && url === '/api/health') {
    handleHealth(req, res)
    return
  }

  const transport = createRealTransport(env)

  if (method === 'POST' && url === '/api/concierge') {
    if (authorizePost(req, res, env, limiter)) {
      void handleConcierge(req, res, transport)
    }
    return
  }

  if (method === 'POST' && url === '/api/room-service') {
    if (authorizePost(req, res, env, limiter)) {
      void handleRoomService(req, res, transport, env)
    }
    return
  }

  if (method === 'POST' && url === '/api/late-checkout') {
    if (authorizePost(req, res, env, limiter)) {
      void handleLateCheckout(req, res, transport, env)
    }
    return
  }

  // Session management routes (admin / front-desk use, still Bearer-protected)
  if (method === 'POST' && url === '/api/session/check-in') {
    if (!authorizePost(req, res, env, limiter)) return
    void handleCheckIn(req, res, env)
    return
  }

  if (method === 'POST' && url === '/api/session/verify') {
    if (!authorizePost(req, res, env, limiter)) return
    void handleVerifySession(req, res, env)
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
  env: EnvConfig,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid JSON body',
      code: 'INVALID_REQUEST',
    })
    return
  }

  const roomId = body.roomNumber as number | undefined
  const guestId = body.guestId as string | undefined
  const sessionId = body.sessionId as string | undefined

  if (
    typeof roomId !== 'number' || !Number.isInteger(roomId) || roomId < 1 || roomId > 9999 ||
    typeof guestId !== 'string' || guestId.trim() === '' ||
    typeof sessionId !== 'string' || sessionId.trim() === ''
  ) {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Validation failed: roomNumber, guestId, sessionId required',
      code: 'MISSING_FIELD',
    })
    return
  }

  const ttlMs = env.sessionTtlHours * 60 * 60 * 1000
  checkIn(roomId, guestId, sessionId, ttlMs)
  const qrToken = generateQrToken(roomId, env.qrTokenSecret)

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Guest checked in',
    data: { roomId, guestId, sessionId, qrToken },
  })
}

async function handleVerifySession(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid JSON body',
      code: 'INVALID_REQUEST',
    })
    return
  }

  const qrToken = body.qrToken as string | undefined
  if (typeof qrToken !== 'string' || qrToken.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'qrToken required',
      code: 'MISSING_FIELD',
    })
    return
  }

  const roomId = verifyQrToken(qrToken, env.qrTokenSecret)
  if (roomId === undefined) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid or tampered QR token',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  const session = getSession(roomId)
  if (!session) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'No active guest session for this room',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Session valid',
    data: {
      roomId: session.roomId,
      guestId: session.guestId,
      sessionId: session.sessionId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
  })
}

function main(): void {
  let env: EnvConfig
  try {
    env = loadEnv()
  } catch (err) {
    console.error('Startup failed:', (err as Error).message)
    process.exit(1)
  }

  const limiter = createRateLimiter(env.rateLimitWindowSeconds, env.rateLimitMax)
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    route(req, res, env, limiter)
  })

  server.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port} (env: ${env.nodeEnv})`)
  })
}

main()
