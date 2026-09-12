/**
 * Backend entry point.
 *
 * Reads Make.com webhook URLs from environment variables.
 * Validates configuration at startup before accepting traffic.
 * The Frontend never sees webhook URLs.
 *
 * SECURITY: Every admin endpoint uses requireAuth() which verifies:
 * 1. Valid staff token (HMAC-SHA256 signature + expiry)
 * 2. User exists in DB and is active
 * 3. Token version matches (revocation check)
 * 4. User's role is in the allowed list for that endpoint
 */

import 'dotenv/config'

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { loadEnv } from './config/env.js'
import { handleConcierge, handleRoomService, handleLateCheckout, handleOrderStatus, handleUpdateOrderStatus, handleListOrders, handleCreateFeedback, handleListFeedback } from './routes/handler.js'
import { createRealTransport } from './webhook/realTransport.js'
import { createRateLimiter, type RateLimiter } from './middleware/rateLimit.js'
import { createIdempotencyStore } from './middleware/idempotency.js'
import { generateQrToken, verifyQrToken } from './session/qrToken.js'
import { checkIn, getSession, checkOut } from './session/store.js'
import { createRoom, getRoomByNumber, listRooms, updateRoomActive, reissueQrToken } from './room/roomStore.js'
import { getActiveStay, checkoutStay } from './stay/store.js'
import { getOrdersByGuest } from './order/store.js'
import {
  getStaffByIdentifier,
  getStaffById,
  verifyStaffCredentials,
  createStaffUser,
  listStaffUsers,
  updateStaffRole,
  deactivateStaffUser,
  changeStaffPassword,
  setMustChangePassword,
  invalidateAllTokens,
  recordFailedLogin,
  resetFailedLogin,
  isAccountLocked,
  type StaffRole,
} from './staff/staffRoleStore.js'
import { createStaffToken } from './auth/staffToken.js'
import { requireAuth, type AuthenticatedUser } from './auth/authorize.js'
import { getDatabase, closeDatabase } from './db/database.js'
import { getAuditLog, recordAuditEvent } from './audit/auditLog.js'
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

  // ─── GUEST-FACING ROUTES ────────────────────────────────────────────
  // These use QR token + session verification inside the handler.

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

  if (method === 'POST' && url === '/api/guest/init') {
    if (authorizeGuest(req, res, limiter)) {
      void handleGuestInit(req, res, env)
    }
    return
  }

  if (method === 'GET' && url?.startsWith('/api/stay/current')) {
    if (authorizeGuest(req, res, limiter)) {
      handleStayCurrent(req, res, env)
    }
    return
  }

  if (method === 'POST' && url === '/api/order/status') {
    if (authorizeGuest(req, res, limiter)) {
      void handleOrderStatus(req, res, env)
    }
    return
  }

  // ─── PUBLIC ROUTES (no auth) ────────────────────────────────────────

  if (method === 'POST' && url === '/api/auth/login') {
    if (!limiter.consume(clientKey(req))) {
      handleRateLimited(res)
      return
    }
    void handleLogin(req, res, env)
    return
  }

  // ─── STAFF ROUTES (authenticated, role checked) ─────────────────────

  const ALL_STAFF: StaffRole[] = ['FRONT_DESK', 'KITCHEN', 'MANAGER', 'OWNER']
  const FRONT_DESK_AND_ABOVE: StaffRole[] = ['FRONT_DESK', 'MANAGER', 'OWNER']
  const MANAGER_AND_ABOVE: StaffRole[] = ['MANAGER', 'OWNER']
  const OWNER_ONLY: StaffRole[] = ['OWNER']

  // Auth/me: any authenticated staff
  if (method === 'GET' && url === '/api/auth/me') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ALL_STAFF)
    if (user) handleAuthMe(user, res)
    return
  }

  // Logout: any authenticated staff
  if (method === 'POST' && url === '/api/auth/logout') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ALL_STAFF)
    if (user) handleLogout(user, req, res, env)
    return
  }

  // Session management: FRONT_DESK and above
  if (method === 'POST' && url === '/api/session/check-in') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, FRONT_DESK_AND_ABOVE)
    if (user) void handleCheckIn(req, res, env, user)
    return
  }

  if (method === 'POST' && url === '/api/session/verify') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, FRONT_DESK_AND_ABOVE)
    if (user) void handleVerifySession(req, res, env)
    return
  }

  if (method === 'POST' && url === '/api/session/checkout') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, FRONT_DESK_AND_ABOVE)
    if (user) handleCheckout(req, res, env, user)
    return
  }

  // Order management: KITCHEN, MANAGER, OWNER
  const ORDER_ROLES: StaffRole[] = ['KITCHEN', 'MANAGER', 'OWNER']

  if (method === 'POST' && url === '/api/order/update-status') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ORDER_ROLES)
    if (user) void handleUpdateOrderStatus(req, res, user)
    return
  }

  if (method === 'GET' && url?.startsWith('/api/admin/orders')) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ORDER_ROLES)
    if (user) void handleListOrders(req, res)
    return
  }

  // Dashboard: MANAGER and above
  if (method === 'GET' && url === '/api/admin/dashboard') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) handleDashboard(res)
    return
  }

  // Room management: MANAGER and above
  if (method === 'GET' && url === '/api/admin/rooms') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) handleListRooms(res)
    return
  }

  if (method === 'POST' && url === '/api/admin/rooms') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) void handleCreateRoom(req, res, env)
    return
  }

  const roomPatchMatch = url?.match(/^\/api\/admin\/rooms\/(\d+)$/)
  if (method === 'PATCH' && roomPatchMatch) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) void handleUpdateRoom(req, res, Number(roomPatchMatch[1]))
    return
  }

  const roomDeleteMatch = url?.match(/^\/api\/admin\/rooms\/(\d+)$/)
  if (method === 'DELETE' && roomDeleteMatch) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) handleDeleteRoom(res, Number(roomDeleteMatch[1]))
    return
  }

  // QR reissue: OWNER only (security-sensitive)
  const roomReissueMatch = url?.match(/^\/api\/admin\/rooms\/(\d+)\/reissue-qr$/)
  if (method === 'PATCH' && roomReissueMatch) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, OWNER_ONLY)
    if (user) void handleReissueRoomQr(req, res, Number(roomReissueMatch[1]), env)
    return
  }

  // Feedback: any authenticated staff
  if (method === 'POST' && url === '/api/admin/feedback') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ALL_STAFF)
    if (user) void handleCreateFeedback(req, res)
    return
  }

  if (method === 'GET' && url === '/api/admin/feedback') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ALL_STAFF)
    if (user) handleListFeedback(req, res)
    return
  }

  // Audit log: MANAGER and above
  if (method === 'GET' && url?.startsWith('/api/admin/audit')) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) handleAuditLog(req, res)
    return
  }

  // ─── USER MANAGEMENT: MANAGER and above ─────────────────────────────

  if (method === 'GET' && url === '/api/admin/users') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) handleListUsers(user, res)
    return
  }

  if (method === 'POST' && url === '/api/admin/users') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) void handleCreateUser(req, res, user)
    return
  }

  const userPatchMatch = url?.match(/^\/api\/admin\/users\/([^/]+)$/)
  if (method === 'PATCH' && userPatchMatch) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) void handleUpdateUser(req, res, user, userPatchMatch[1])
    return
  }

  const userDeactivateMatch = url?.match(/^\/api\/admin\/users\/([^/]+)\/deactivate$/)
  if (method === 'POST' && userDeactivateMatch) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) handleDeactivateUser(user, res, userDeactivateMatch[1])
    return
  }

  const userResetPasswordMatch = url?.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/)
  if (method === 'POST' && userResetPasswordMatch) {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, MANAGER_AND_ABOVE)
    if (user) void handleResetUserPassword(req, res, user, userResetPasswordMatch[1])
    return
  }

  // Password change: any authenticated staff
  if (method === 'POST' && url === '/api/auth/change-password') {
    if (!limiter.consume(clientKey(req))) { handleRateLimited(res); return }
    const user = requireAuth(req, res, env, ALL_STAFF)
    if (user) void handleChangePassword(req, res, user, env)
    return
  }

  sendJson(res, 404, {
    status: 'error',
    requestId: crypto.randomUUID(),
    message: 'Route not found',
    code: 'NOT_FOUND',
  })
}

// ─── HANDLER FUNCTIONS ─────────────────────────────────────────────────

async function handleCheckIn(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
  _user: AuthenticatedUser,
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

  const guestId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()

  const ttlMs = env.sessionTtlHours * 60 * 60 * 1000
  const room = getRoomByNumber(roomId)
  const qrToken = room?.qrToken ?? generateQrToken(roomId, env.qrTokenSecret)
  checkIn(roomId, guestId, sessionId, ttlMs, qrToken)

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Guest checked in',
    data: { roomId, guestId, sessionId, qrToken },
  })
}

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

  const verifiedRoomId = tokenResult.roomId

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

  if (room && room.qrToken !== qrToken) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'QR token does not match room',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  const existingSession = getSession(verifiedRoomId)
  if (existingSession) {
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

  const guestId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  const ttlMs = env.sessionTtlHours * 60 * 60 * 1000
  const session = checkIn(verifiedRoomId, guestId, sessionId, ttlMs, qrToken)

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

  let session = getSession(tokenResult.roomId)
  if (!session) {
    const guestId = crypto.randomUUID()
    const sessionId = crypto.randomUUID()
    const ttlMs = env.sessionTtlHours * 60 * 60 * 1000
    session = checkIn(tokenResult.roomId, guestId, sessionId, ttlMs, qrToken)
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

function handleCheckout(req: IncomingMessage, res: ServerResponse, _env: EnvConfig, user: AuthenticatedUser): void {
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

    checkoutStay(activeStay.stayId)
    checkOut(roomNumber)

    recordAuditEvent({
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      action: 'CHECKOUT',
      entityType: 'stay',
      entityId: activeStay.stayId,
      details: JSON.stringify({ roomNumber, stayId: activeStay.stayId }),
      ipAddress: req.socket.remoteAddress ?? undefined,
    })

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
  }).catch((_err) => {
    sendJson(res, 500, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Internal error during checkout',
      code: 'INTERNAL_ERROR',
    })
  })
}

function handleDashboard(res: ServerResponse): void {
  const db = getDatabase()

  const revenueRow = db.prepare(
    `SELECT COALESCE(SUM(total), 0) as revenue FROM orders WHERE created_at >= ?`,
  ).get(Date.now() - 24 * 60 * 60 * 1000) as { revenue: number } | undefined
  const roomServiceRevenue = revenueRow?.revenue ?? 0

  const ordersByStatus = db.prepare(
    `SELECT status, COUNT(*) as count FROM orders WHERE status IN ('NEW', 'PREPARING', 'READY') GROUP BY status`,
  ).all() as Array<{ status: string; count: number }>
  const activeOrders = { NEW: 0, PREPARING: 0, READY: 0 }
  for (const row of ordersByStatus) {
    if (row.status in activeOrders) {
      activeOrders[row.status as keyof typeof activeOrders] = row.count
    }
  }

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
    data: { roomServiceRevenue, activeOrders, roomUtilization },
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

// ─── AUTH HANDLERS ──────────────────────────────────────────────────────

async function handleLogin(
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

  const identifier = body.identifier as string | undefined
  const password = body.password as string | undefined

  if (typeof identifier !== 'string' || identifier.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'identifier required',
      code: 'MISSING_FIELD',
    })
    return
  }

  if (typeof password !== 'string' || password === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'password required',
      code: 'MISSING_FIELD',
    })
    return
  }

  // Check account lockout
  if (isAccountLocked(identifier)) {
    recordAuditEvent({
      action: 'LOGIN_LOCKED',
      entityType: 'auth',
      details: JSON.stringify({ identifier }),
      ipAddress: req.socket.remoteAddress ?? undefined,
    })
    sendJson(res, 429, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Account temporarily locked due to too many failed attempts',
      code: 'RATE_LIMITED',
    })
    return
  }

  const user = verifyStaffCredentials(identifier, password)
  if (!user) {
    const lockResult = recordFailedLogin(identifier)
    recordAuditEvent({
      action: 'LOGIN_FAILED',
      entityType: 'auth',
      details: JSON.stringify({ identifier, attempts: lockResult.attempts, locked: lockResult.locked }),
      ipAddress: req.socket.remoteAddress ?? undefined,
    })
    sendJson(res, 401, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid credentials',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  // Successful login: reset failed attempts
  resetFailedLogin(identifier)

  const token = createStaffToken(user.id, user.tokenVersion, env.staffTokenSecret)

  recordAuditEvent({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'LOGIN_SUCCESS',
    entityType: 'auth',
    ipAddress: req.socket.remoteAddress ?? undefined,
  })

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Login successful',
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        identifier: user.identifier,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    },
  })
}

function handleAuthMe(user: AuthenticatedUser, res: ServerResponse): void {
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Staff profile retrieved',
    data: {
      id: user.userId,
      name: user.name,
      identifier: user.identifier,
      role: user.role,
    },
  })
}

function handleLogout(user: AuthenticatedUser, req: IncomingMessage, res: ServerResponse, _env: EnvConfig): void {
  // Invalidate token by incrementing token version
  invalidateAllTokens(user.userId)

  recordAuditEvent({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'LOGOUT',
    entityType: 'auth',
    ipAddress: req.socket.remoteAddress ?? undefined,
  })

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Logged out successfully',
  })
}

function handleAuditLog(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const limit = Number(url.searchParams.get('limit') ?? '50')
  const offset = Number(url.searchParams.get('offset') ?? '0')
  const entityType = url.searchParams.get('entityType') ?? undefined
  const action = url.searchParams.get('action') ?? undefined
  const sinceParam = url.searchParams.get('since')
  const since = sinceParam ? Number(sinceParam) : undefined

  const result = getAuditLog({
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
    entityType,
    action,
    since,
  })

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `${result.events.length} audit event(s) found`,
    data: { events: result.events, total: result.total },
  })
}

// ─── USER MANAGEMENT HANDLERS ──────────────────────────────────────────

function handleListUsers(caller: AuthenticatedUser, res: ServerResponse): void {
  const users = listStaffUsers(true)
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `${users.length} user(s) found`,
    data: {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        identifier: u.identifier,
        role: u.role,
        active: u.active,
        mustChangePassword: u.mustChangePassword,
        createdAt: new Date(u.createdAt).toISOString(),
      })),
    },
  })
}

async function handleCreateUser(
  req: IncomingMessage,
  res: ServerResponse,
  caller: AuthenticatedUser,
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

  const name = body.name as string | undefined
  const identifier = body.identifier as string | undefined
  const role = body.role as string | undefined
  const password = body.password as string | undefined

  if (typeof name !== 'string' || name.trim() === '') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'name required', code: 'MISSING_FIELD' })
    return
  }
  if (typeof identifier !== 'string' || identifier.trim() === '') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'identifier required', code: 'MISSING_FIELD' })
    return
  }
  if (role !== 'FRONT_DESK' && role !== 'KITCHEN' && role !== 'MANAGER' && role !== 'OWNER') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'role must be FRONT_DESK, KITCHEN, MANAGER, or OWNER', code: 'MISSING_FIELD' })
    return
  }
  if (typeof password !== 'string' || password.length < 6) {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'password must be at least 6 characters', code: 'MISSING_FIELD' })
    return
  }

  // Prevent creating OWNER from non-OWNER
  if (role === 'OWNER' && caller.role !== 'OWNER') {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Only OWNER can create OWNER accounts', code: 'FORBIDDEN' })
    return
  }

  // Check duplicate
  const existing = getStaffByIdentifier(identifier)
  if (existing) {
    sendJson(res, 409, { status: 'error', requestId: 'local-validation', message: 'Identifier already exists', code: 'CONFLICT' })
    return
  }

  const id = crypto.randomUUID()
  const newUser = createStaffUser(id, name, identifier, role as StaffRole, password, true)

  recordAuditEvent({
    userId: caller.userId,
    userName: caller.name,
    userRole: caller.role,
    action: 'USER_CREATED',
    entityType: 'user',
    entityId: id,
    details: JSON.stringify({ name, identifier, role }),
    ipAddress: req.socket.remoteAddress ?? undefined,
  })

  sendJson(res, 201, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'User created',
    data: {
      id: newUser.id,
      name: newUser.name,
      identifier: newUser.identifier,
      role: newUser.role,
      mustChangePassword: newUser.mustChangePassword,
    },
  })
}

async function handleUpdateUser(
  req: IncomingMessage,
  res: ServerResponse,
  caller: AuthenticatedUser,
  targetId: string,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid JSON body', code: 'INVALID_REQUEST' })
    return
  }

  const role = body.role as string | undefined
  if (role && role !== 'FRONT_DESK' && role !== 'KITCHEN' && role !== 'MANAGER' && role !== 'OWNER') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid role', code: 'MISSING_FIELD' })
    return
  }

  const target = getStaffById(targetId)
  if (!target) {
    sendJson(res, 404, { status: 'error', requestId: 'local-validation', message: 'User not found', code: 'NOT_FOUND' })
    return
  }

  // Prevent modifying OWNER from non-OWNER
  if (target.role === 'OWNER' && caller.role !== 'OWNER') {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Only OWNER can modify OWNER accounts', code: 'FORBIDDEN' })
    return
  }

  // Prevent creating new OWNER from non-OWNER
  if (role === 'OWNER' && caller.role !== 'OWNER') {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Only OWNER can assign OWNER role', code: 'FORBIDDEN' })
    return
  }

  if (role) {
    updateStaffRole(targetId, role as StaffRole)
  }

  recordAuditEvent({
    userId: caller.userId,
    userName: caller.name,
    userRole: caller.role,
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: targetId,
    details: JSON.stringify({ role }),
    ipAddress: req.socket.remoteAddress ?? undefined,
  })

  const updated = getStaffById(targetId)
  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'User updated',
    data: {
      id: updated?.id,
      name: updated?.name,
      identifier: updated?.identifier,
      role: updated?.role,
    },
  })
}

function handleDeactivateUser(
  caller: AuthenticatedUser,
  res: ServerResponse,
  targetId: string,
): void {
  const target = getStaffById(targetId)
  if (!target) {
    sendJson(res, 404, { status: 'error', requestId: 'local-validation', message: 'User not found', code: 'NOT_FOUND' })
    return
  }

  // Prevent deactivating yourself
  if (targetId === caller.userId) {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Cannot deactivate yourself', code: 'INVALID_REQUEST' })
    return
  }

  // Prevent deactivating OWNER from non-OWNER
  if (target.role === 'OWNER' && caller.role !== 'OWNER') {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Only OWNER can deactivate OWNER accounts', code: 'FORBIDDEN' })
    return
  }

  deactivateStaffUser(targetId)

  recordAuditEvent({
    userId: caller.userId,
    userName: caller.name,
    userRole: caller.role,
    action: 'USER_DEACTIVATED',
    entityType: 'user',
    entityId: targetId,
    details: JSON.stringify({ name: target.name, identifier: target.identifier }),
    ipAddress: undefined,
  })

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'User deactivated',
  })
}

async function handleResetUserPassword(
  req: IncomingMessage,
  res: ServerResponse,
  caller: AuthenticatedUser,
  targetId: string,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid JSON body', code: 'INVALID_REQUEST' })
    return
  }

  const newPassword = body.newPassword as string | undefined
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'newPassword must be at least 6 characters', code: 'MISSING_FIELD' })
    return
  }

  const target = getStaffById(targetId)
  if (!target) {
    sendJson(res, 404, { status: 'error', requestId: 'local-validation', message: 'User not found', code: 'NOT_FOUND' })
    return
  }

  // Prevent resetting yourself
  if (targetId === caller.userId) {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Cannot reset your own password here', code: 'INVALID_REQUEST' })
    return
  }

  // Prevent resetting OWNER from non-OWNER
  if (target.role === 'OWNER' && caller.role !== 'OWNER') {
    sendJson(res, 403, { status: 'error', requestId: 'local-validation', message: 'Only OWNER can reset OWNER passwords', code: 'FORBIDDEN' })
    return
  }

  changeStaffPassword(targetId, newPassword)
  setMustChangePassword(targetId, true)
  invalidateAllTokens(targetId)

  recordAuditEvent({
    userId: caller.userId,
    userName: caller.name,
    userRole: caller.role,
    action: 'PASSWORD_RESET',
    entityType: 'user',
    entityId: targetId,
    details: JSON.stringify({ name: target.name, identifier: target.identifier }),
    ipAddress: req.socket.remoteAddress ?? undefined,
  })

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Password reset. User must change on next login.',
    data: { newPassword },
  })
}

async function handleChangePassword(
  req: IncomingMessage,
  res: ServerResponse,
  user: AuthenticatedUser,
  env: EnvConfig,
): Promise<void> {
  let body: Record<string, unknown>
  try {
    const raw = await readBody(req)
    body = JSON.parse(raw) as Record<string, unknown>
  } catch {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'Invalid JSON body', code: 'INVALID_REQUEST' })
    return
  }

  const currentPassword = body.currentPassword as string | undefined
  const newPassword = body.newPassword as string | undefined

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'currentPassword and newPassword required', code: 'MISSING_FIELD' })
    return
  }

  if (newPassword.length < 6) {
    sendJson(res, 400, { status: 'error', requestId: 'local-validation', message: 'New password must be at least 6 characters', code: 'MISSING_FIELD' })
    return
  }

  // Verify current password
  const fullUser = getStaffByIdentifier(user.identifier)
  if (!fullUser) {
    sendJson(res, 401, { status: 'error', requestId: 'local-validation', message: 'User not found', code: 'AUTH_REQUIRED' })
    return
  }

  const valid = verifyStaffCredentials(user.identifier, currentPassword)
  if (!valid) {
    sendJson(res, 401, { status: 'error', requestId: 'local-validation', message: 'Current password is incorrect', code: 'AUTH_REQUIRED' })
    return
  }

  changeStaffPassword(user.userId, newPassword)

  // Create new token with incremented version
  const newToken = createStaffToken(user.userId, user.tokenVersion + 1, env.staffTokenSecret)

  recordAuditEvent({
    userId: user.userId,
    userName: user.name,
    userRole: user.role,
    action: 'PASSWORD_CHANGED',
    entityType: 'user',
    entityId: user.userId,
    ipAddress: undefined,
  })

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Password changed successfully',
    data: { token: newToken },
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

  // Validate secrets in production
  if (env.nodeEnv === 'production') {
    if (env.staffTokenSecret.includes('dev-staff-secret')) {
      console.error('SECURITY: STAFF_TOKEN_SECRET is using the default dev value. Set a real secret in production.')
      process.exit(1)
    }
    if (env.qrTokenSecret.includes('dev-qr-secret')) {
      console.error('SECURITY: QR_TOKEN_SECRET is using the default dev value. Set a real secret in production.')
      process.exit(1)
    }
  }

  try {
    getDatabase(env.dbPath)
    console.log(`Database opened: ${env.dbPath}`)

    // Auto-seed default staff accounts when the table is empty.
    // This only fires on first deploy or after a complete data wipe.
    // It never overwrites existing users.
    const existingUser = getStaffByIdentifier('frontdesk')
    if (!existingUser) {
      console.warn('⚠️  STAFF SEED: staff_users table is empty — seeding 4 default accounts (must_change_password=true). This should only happen on first deploy.')
      const defaults = [
        { id: 'staff-001', name: 'Front Desk Staff', identifier: 'frontdesk', role: 'FRONT_DESK' as StaffRole, password: 'hotel123' },
        { id: 'staff-002', name: 'Kitchen Staff', identifier: 'kitchen', role: 'KITCHEN' as StaffRole, password: 'hotel123' },
        { id: 'staff-003', name: 'Hotel Manager', identifier: 'manager', role: 'MANAGER' as StaffRole, password: 'hotel123' },
        { id: 'staff-004', name: 'Hotel Owner', identifier: 'owner', role: 'OWNER' as StaffRole, password: 'hotel123' },
      ]
      for (const s of defaults) {
        createStaffUser(s.id, s.name, s.identifier, s.role, s.password, true)
      }
      console.warn('⚠️  STAFF SEED: 4 default accounts created. All require password change on first login.')
    }
  } catch (err) {
    console.error('Database startup failed:', (err as Error).message)
    process.exit(1)
  }

  const limiter = createRateLimiter(env.rateLimitWindowSeconds, env.rateLimitMax)
  const idempotencyStore = createIdempotencyStore()
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    route(req, res, env, limiter, idempotencyStore)
  })

  function shutdown(): void {
    console.log('Shutting down...')
    server.close(() => {
      closeDatabase()
      console.log('Shutdown complete.')
      process.exit(0)
    })
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
