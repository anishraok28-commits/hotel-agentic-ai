/**
 * Backend entry point.
 *
 * Reads Make.com webhook URLs from environment variables.
 * Validates configuration at startup before accepting traffic.
 * The Frontend never sees webhook URLs.
 */

import 'dotenv/config'

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { loadEnv } from './config/env.js'
import { handleConcierge, handleRoomService, handleLateCheckout, handleOrderStatus, handleUpdateOrderStatus, handleListOrders, handleCreateFeedback, handleListFeedback } from './routes/handler.js'
import { createRealTransport } from './webhook/realTransport.js'
import { isAuthorized } from './middleware/auth.js'
import { createRateLimiter, type RateLimiter } from './middleware/rateLimit.js'
import { createIdempotencyStore } from './middleware/idempotency.js'
import { generateQrToken, verifyQrToken } from './session/qrToken.js'
import { checkIn, getSession, checkOut } from './session/store.js'
import { createRoom, getRoomByNumber, listRooms, updateRoomActive, reissueQrToken } from './room/roomStore.js'
import { getActiveStay, checkoutStay } from './stay/store.js'
import { getOrdersByGuest } from './order/store.js'
import { getStaffByIdentifier } from './staff/staffRoleStore.js'
import { getDatabase, closeDatabase } from './db/database.js'
import type { EnvConfig } from './config/env.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
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

/**
 * Guest-facing POST routes: rate-limited but no SERVICE_TOKEN required.
 * Authentication is handled by QR token + active session validation
 * in the route handler itself.
 */
function authorizeGuest(
  req: IncomingMessage,
  res: ServerResponse,
  limiter: RateLimiter,
): boolean {
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
  idempotencyStore: ReturnType<typeof createIdempotencyStore>,
): void {
  const { method, url } = req

  const corsApplied = applyCorsHeaders(req, res, env)

  if (method === 'OPTIONS' && corsApplied) {
    res.writeHead(204).end()
    return
  }

  if (method === 'GET' && url === '/api/health') {
    handleHealth(req, res, env)
    return
  }

  const transport = createRealTransport(env)

  // Guest-facing routes: rate-limited, QR token + session verified in handler
  if (method === 'POST' && url === '/api/concierge') {
    if (authorizeGuest(req, res, limiter)) {
      void handleConcierge(req, res, transport)
    }
    return
  }

  if (method === 'POST' && url === '/api/room-service') {
    if (authorizeGuest(req, res, limiter)) {
      void handleRoomService(req, res, transport, env, idempotencyStore)
    }
    return
  }

  if (method === 'POST' && url === '/api/late-checkout') {
    if (authorizeGuest(req, res, limiter)) {
      void handleLateCheckout(req, res, transport, env)
    }
    return
  }

  // Guest initialization: exchange QR token for session credentials
  if (method === 'POST' && url === '/api/guest/init') {
    if (authorizeGuest(req, res, limiter)) {
      void handleGuestInit(req, res, env)
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

  // Current active stay query (guest-authenticated via QR token).
  // Returns the active stay and its order history for cross-device state.
  if (method === 'GET' && url?.startsWith('/api/stay/current')) {
    if (authorizeGuest(req, res, limiter)) {
      handleStayCurrent(req, res, env)
    }
    return
  }

  // Staff checkout: close an active stay for a room.
  if (method === 'POST' && url === '/api/session/checkout') {
    if (!authorizePost(req, res, env, limiter)) return
    handleCheckout(req, res, env)
    return
  }

  // Order status query (guest-authenticated via QR token + session)
  if (method === 'POST' && url === '/api/order/status') {
    if (authorizeGuest(req, res, limiter)) {
      void handleOrderStatus(req, res, env)
    }
    return
  }

  // Order status update (admin Bearer-protected)
  if (method === 'POST' && url === '/api/order/update-status') {
    if (!authorizePost(req, res, env, limiter)) return
    void handleUpdateOrderStatus(req, res)
    return
  }

  // Admin order listing (Bearer-protected, supports ?status= filter)
  if (method === 'GET' && url?.startsWith('/api/admin/orders')) {
    if (!authorizePost(req, res, env, limiter)) return
    void handleListOrders(req, res)
    return
  }

  // Staff role lookup (Bearer-protected)
  if (method === 'GET' && url === '/api/admin/staff/me') {
    if (!authorizePost(req, res, env, limiter)) return
    handleStaffMe(req, res)
    return
  }

  // Owner dashboard metrics (Bearer-protected)
  if (method === 'GET' && url === '/api/admin/dashboard') {
    if (!authorizePost(req, res, env, limiter)) return
    handleDashboard(res)
    return
  }

  // Room management routes (Bearer-protected)
  if (method === 'GET' && url === '/api/admin/rooms') {
    if (!authorizePost(req, res, env, limiter)) return
    handleListRooms(res)
    return
  }

  if (method === 'POST' && url === '/api/admin/rooms') {
    if (!authorizePost(req, res, env, limiter)) return
    void handleCreateRoom(req, res, env)
    return
  }

  const roomPatchMatch = url?.match(/^\/api\/admin\/rooms\/(\d+)$/)
  if (method === 'PATCH' && roomPatchMatch) {
    if (!authorizePost(req, res, env, limiter)) return
    void handleUpdateRoom(req, res, Number(roomPatchMatch[1]))
    return
  }

  const roomDeleteMatch = url?.match(/^\/api\/admin\/rooms\/(\d+)$/)
  if (method === 'DELETE' && roomDeleteMatch) {
    if (!authorizePost(req, res, env, limiter)) return
    handleDeleteRoom(res, Number(roomDeleteMatch[1]))
    return
  }

  // Room QR reissue (Bearer-protected)
  const roomReissueMatch = url?.match(/^\/api\/admin\/rooms\/(\d+)\/reissue-qr$/)
  if (method === 'PATCH' && roomReissueMatch) {
    if (!authorizePost(req, res, env, limiter)) return
    void handleReissueRoomQr(req, res, Number(roomReissueMatch[1]), env)
    return
  }

  // Internal feedback capture (Bearer-protected)
  if (method === 'POST' && url === '/api/admin/feedback') {
    if (!authorizePost(req, res, env, limiter)) return
    void handleCreateFeedback(req, res)
    return
  }

  if (method === 'GET' && url === '/api/admin/feedback') {
    if (!authorizePost(req, res, env, limiter)) return
    handleListFeedback(req, res)
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

  if (
    typeof roomId !== 'number' || !Number.isInteger(roomId) || roomId < 1 || roomId > 9999
  ) {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Validation failed: roomNumber (integer 1-9999) required',
      code: 'MISSING_FIELD',
    })
    return
  }

  // Server-generate cryptographically secure guestId and sessionId
  const guestId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()

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

/**
 * Guest initialization: exchange a QR token (from a QR code URL) for
 * session credentials. No SERVICE_TOKEN required — the QR token itself
 * is the authentication credential.
 */
async function handleGuestInit(
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
  const roomNumber = body.roomNumber as number | undefined

  if (typeof qrToken !== 'string' || qrToken.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'qrToken required',
      code: 'MISSING_FIELD',
    })
    return
  }

  // Verify QR token — room identity is derived solely from the signed token
  const tokenResult = verifyQrToken(qrToken, env.qrTokenSecret)
  if (tokenResult === undefined) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid, expired, or tampered QR token',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  // Room identity comes exclusively from the verified token
  const verifiedRoomId = tokenResult.roomId

  // If a roomNumber was provided (legacy QR URLs), reject mismatches
  if (
    typeof roomNumber === 'number' && Number.isInteger(roomNumber) &&
    roomNumber >= 1 && roomNumber <= 9999 &&
    roomNumber !== verifiedRoomId
  ) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'QR token room mismatch',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  // Verify room exists and is active in the rooms table
  const room = getRoomByNumber(verifiedRoomId)
  if (room && !room.active) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Room is not active',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  // Also verify the token matches the room's stored token (if room exists in DB)
  if (room && room.qrToken !== qrToken) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'QR token does not match room',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  // Check for existing active session for this room
  const existingSession = getSession(verifiedRoomId)
  if (existingSession) {
    // Return existing session credentials
    sendJson(res, 200, {
      status: 'ok',
      requestId: crypto.randomUUID(),
      message: 'Session active',
      data: {
        roomId: existingSession.roomId,
        guestId: existingSession.guestId,
        sessionId: existingSession.sessionId,
        expiresAt: new Date(existingSession.expiresAt).toISOString(),
      },
    })
    return
  }

  // Create a new session with server-generated IDs
  const guestId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  const ttlMs = env.sessionTtlHours * 60 * 60 * 1000
  const session = checkIn(verifiedRoomId, guestId, sessionId, ttlMs)

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Session created',
    data: {
      roomId: session.roomId,
      guestId: session.guestId,
      sessionId: session.sessionId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    },
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

  const tokenResult = verifyQrToken(qrToken, env.qrTokenSecret)
  if (tokenResult === undefined) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid or expired QR token',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  const session = getSession(tokenResult.roomId)
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

/**
 * GET /api/stay/current?token=<qrToken>
 *
 * Returns the active stay and its order history for the room identified
 * by the QR token. This is the cross-device state endpoint: all devices
 * scanning the same QR resolve to the same active stay.
 */
function handleStayCurrent(req: IncomingMessage, res: ServerResponse, env: EnvConfig): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const qrToken = url.searchParams.get('token') ?? ''

  if (typeof qrToken !== 'string' || qrToken.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'token query parameter required',
      code: 'MISSING_FIELD',
    })
    return
  }

  const tokenResult = verifyQrToken(qrToken, env.qrTokenSecret)
  if (tokenResult === undefined) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid, expired, or tampered QR token',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  const room = getRoomByNumber(tokenResult.roomId)
  if (room && !room.active) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Room is not active',
      code: 'AUTH_REQUIRED',
    })
    return
  }
  if (room && room.qrToken !== qrToken) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'QR token does not match room',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  const session = getSession(tokenResult.roomId)
  if (!session) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: 'No active session for this room',
      code: 'NOT_FOUND',
    })
    return
  }

  const activeStay = getActiveStay(tokenResult.roomId)
  const orders = getOrdersByGuest(session.guestId, session.sessionId, tokenResult.roomId)

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Active stay retrieved',
    data: {
      stay: activeStay ? {
        stayId: activeStay.stayId,
        roomNumber: activeStay.roomNumber,
        status: activeStay.status,
        checkedInAt: new Date(activeStay.checkedInAt).toISOString(),
        checkedOutAt: activeStay.checkedOutAt ? new Date(activeStay.checkedOutAt).toISOString() : null,
      } : null,
      session: {
        roomId: session.roomId,
        guestId: session.guestId,
        sessionId: session.sessionId,
        expiresAt: new Date(session.expiresAt).toISOString(),
      },
      orders: orders.map((o) => ({
        orderId: o.orderId,
        status: o.status,
        roomNumber: o.roomNumber,
        items: o.items,
        total: o.total,
        notes: o.notes,
        createdAt: new Date(o.createdAt).toISOString(),
        updatedAt: new Date(o.updatedAt).toISOString(),
      })),
    },
  })
}

/**
 * POST /api/session/checkout
 * Staff-controlled checkout: closes an active stay and session for a room.
 */
function handleCheckout(req: IncomingMessage, res: ServerResponse, _env: EnvConfig): void {
  readBody(req).then((raw) => {
    let body: Record<string, unknown>
    try {
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

    const roomNumber = body.roomNumber as number | undefined
    if (typeof roomNumber !== 'number' || !Number.isInteger(roomNumber) || roomNumber < 1 || roomNumber > 9999) {
      sendJson(res, 400, {
        status: 'error',
        requestId: 'local-validation',
        message: 'roomNumber required (integer 1-9999)',
        code: 'MISSING_FIELD',
      })
      return
    }

    const activeStay = getActiveStay(roomNumber)
    if (!activeStay) {
      sendJson(res, 404, {
        status: 'error',
        requestId: 'local-validation',
        message: 'No active stay for this room',
        code: 'NOT_FOUND',
      })
      return
    }

    // Close the stay
    checkoutStay(activeStay.stayId)

    // Delete the active session
    checkOut(roomNumber)

    sendJson(res, 200, {
      status: 'ok',
      requestId: crypto.randomUUID(),
      message: 'Room checked out successfully',
      data: {
        roomNumber,
        stayId: activeStay.stayId,
        checkedOutAt: new Date().toISOString(),
      },
    })
  }).catch((err) => {
    sendJson(res, 500, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Internal error during checkout',
      code: 'INTERNAL_ERROR',
    })
  })
}

function handleStaffMe(req: IncomingMessage, res: ServerResponse): void {
  // For the pilot, we use a default staff identifier since there's no login system.
  // The frontend role is UI gating only; backend enforces role permissions on specific endpoints.
  const defaultIdentifier = 'pilot-staff'
  const staff = getStaffByIdentifier(defaultIdentifier)

  if (!staff) {
    sendJson(res, 200, {
      status: 'ok',
      requestId: crypto.randomUUID(),
      message: 'No staff record found',
      data: { staffId: null, name: null, role: null },
    })
    return
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Staff role retrieved',
    data: { staffId: staff.id, name: staff.name, role: staff.role },
  })
}

function handleDashboard(res: ServerResponse): void {
  const db = getDatabase()

  // Room service revenue (24h)
  const revenueRow = db.prepare(
    `SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE created_at >= ?`,
  ).get(Date.now() - 24 * 60 * 60 * 1000) as { revenue: number } | undefined
  const roomServiceRevenue = revenueRow?.revenue ?? 0

  // Active orders by status
  const ordersByStatus = db.prepare(
    `SELECT status, COUNT(*) as count FROM orders WHERE status IN ('NEW', 'PREPARING', 'READY') GROUP BY status`,
  ).all() as Array<{ status: string; count: number }>
  const activeOrders = {
    NEW: 0,
    PREPARING: 0,
    READY: 0,
  }
  for (const row of ordersByStatus) {
    if (row.status in activeOrders) {
      activeOrders[row.status as keyof typeof activeOrders] = row.count
    }
  }

  // Session-based room utilization
  const activeSessions = db.prepare(
    `SELECT COUNT(*) as count FROM sessions WHERE expires_at > ?`,
  ).get(Date.now()) as { count: number } | undefined
  const activeRooms = db.prepare(
    `SELECT COUNT(*) as count FROM rooms WHERE active = 1`,
  ).get() as { count: number } | undefined

  const roomUtilization = {
    activeSessions: activeSessions?.count ?? 0,
    activeRooms: activeRooms?.count ?? 0,
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Dashboard metrics retrieved',
    data: {
      roomServiceRevenue,
      activeOrders,
      roomUtilization,
    },
  })
}

function handleListRooms(res: ServerResponse): void {
  const rooms = listRooms()
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Rooms listed',
    data: { rooms },
  })
}

async function handleCreateRoom(
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

  const roomNumber = body.roomNumber as number | undefined
  if (
    typeof roomNumber !== 'number' || !Number.isInteger(roomNumber) ||
    roomNumber < 1 || roomNumber > 9999
  ) {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'roomNumber (integer 1-9999) required',
      code: 'MISSING_FIELD',
    })
    return
  }

  // Check for duplicate
  const existing = getRoomByNumber(roomNumber)
  if (existing) {
    sendJson(res, 409, {
      status: 'error',
      requestId: 'local-validation',
      message: `Room ${roomNumber} already exists`,
      code: 'MISSING_FIELD',
    })
    return
  }

  // Generate a unique QR token for this room
  const qrToken = generateQrToken(roomNumber, env.qrTokenSecret)
  const room = createRoom(roomNumber, qrToken)

  const frontendUrl = env.allowedOrigins[0] ?? 'http://localhost:5173'
  const qrUrl = `${frontendUrl}/?token=${encodeURIComponent(qrToken)}`

  sendJson(res, 201, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `Room ${roomNumber} created`,
    data: { room, qrUrl },
  })
}

async function handleUpdateRoom(
  req: IncomingMessage,
  res: ServerResponse,
  roomNumber: number,
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

  const active = body.active as boolean | undefined
  if (typeof active !== 'boolean') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'active (boolean) required',
      code: 'MISSING_FIELD',
    })
    return
  }

  const room = updateRoomActive(roomNumber, active)
  if (!room) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: `Room ${roomNumber} not found`,
      code: 'NOT_FOUND',
    })
    return
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `Room ${roomNumber} updated`,
    data: { room },
  })
}

function handleDeleteRoom(res: ServerResponse, roomNumber: number): void {
  const room = getRoomByNumber(roomNumber)
  if (!room) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: `Room ${roomNumber} not found`,
      code: 'NOT_FOUND',
    })
    return
  }

  updateRoomActive(roomNumber, false)
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `Room ${roomNumber} deactivated`,
    data: { room: { ...room, active: false } },
  })
}

async function handleReissueRoomQr(
  req: IncomingMessage,
  res: ServerResponse,
  roomNumber: number,
  env: EnvConfig,
): Promise<void> {
  const room = getRoomByNumber(roomNumber)
  if (!room) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: `Room ${roomNumber} not found`,
      code: 'NOT_FOUND',
    })
    return
  }

  // Generate a new QR token (reuses existing secure implementation)
  const newQrToken = generateQrToken(roomNumber, env.qrTokenSecret)
  const updatedRoom = reissueQrToken(roomNumber, newQrToken)

  if (!updatedRoom) {
    sendJson(res, 500, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Failed to reissue QR token',
      code: 'INTERNAL_ERROR',
    })
    return
  }

  const frontendUrl = env.allowedOrigins[0] ?? 'http://localhost:5173'
  const qrUrl = `${frontendUrl}/?token=${encodeURIComponent(newQrToken)}`

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `Room ${roomNumber} QR token reissued`,
    data: { room: updatedRoom, qrUrl },
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

  // Initialize the database (creates tables if they don't exist)
  try {
    getDatabase(env.dbPath)
    console.log(`Database opened: ${env.dbPath}`)
  } catch (err) {
    console.error('Database startup failed:', (err as Error).message)
    process.exit(1)
  }

  const limiter = createRateLimiter(env.rateLimitWindowSeconds, env.rateLimitMax)
  const idempotencyStore = createIdempotencyStore()
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    route(req, res, env, limiter, idempotencyStore)
  })

  // Graceful shutdown: close DB connection
  function shutdown(): void {
    console.log('Shutting down...')
    server.close(() => {
      closeDatabase()
      console.log('Shutdown complete.')
      process.exit(0)
    })
    // Force exit after 5 seconds if graceful shutdown hangs
    setTimeout(() => {
      console.error('Forced shutdown after timeout.')
      closeDatabase()
      process.exit(1)
    }, 5_000)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`Backend listening on port ${env.port} (env: ${env.nodeEnv})`)
  })
}

main()
