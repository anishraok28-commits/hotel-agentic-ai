/**
 * Route handler.
 *
 * Receives validated payloads from the Frontend and forwards them
 * to the Make.com webhook via the active transport.
 *
 * The Frontend never sees Make webhook URLs.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebhookTransport, WebhookPayload } from '../webhook/transport.js'
import {
  validateConciergePayload,
  validateRoomServicePayload,
  validateLateCheckoutPayload,
} from './validate.js'
import { verifyQrToken } from '../session/qrToken.js'
import { verifySession } from '../session/store.js'
import type { EnvConfig } from '../config/env.js'
import type { IdempotencyStore } from '../middleware/idempotency.js'
import {
  createOrder,
  getOrder,
  updateOrderStatus,
  listOrders,
} from '../order/store.js'
import type { OrderItem } from '../order/store.js'

const MAX_BODY_BYTES = 50 * 1024

export class PayloadTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the size limit')
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let rejected = false
    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        rejected = true
        req.pause()
        reject(new PayloadTooLargeError())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      resolve(Buffer.concat(chunks).toString())
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function sendTooLarge(res: ServerResponse): void {
  sendJson(res, 413, {
    status: 'error',
    requestId: 'local-validation',
    message: 'Request body is too large',
    code: 'INVALID_REQUEST',
  })
}

async function readAndParse(req: IncomingMessage, res: ServerResponse): Promise<unknown | undefined> {
  let raw: string
  try {
    raw = await readBody(req)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      sendTooLarge(res)
      return undefined
    }
    throw err
  }

  try {
    return JSON.parse(raw)
  } catch {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid JSON body',
      code: 'INVALID_REQUEST',
    })
    return undefined
  }
}

export async function handleConcierge(
  req: IncomingMessage,
  res: ServerResponse,
  transport: WebhookTransport,
): Promise<void> {
  const payload = await readAndParse(req, res)
  if (payload === undefined) return

  const result = validateConciergePayload(payload)
  if (!result.ok) {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: `Validation failed: ${result.errors.map((e) => e.field).join(', ')}`,
      code: 'MISSING_FIELD',
    })
    return
  }

  try {
    const webhookPayload = payload as WebhookPayload
    const response = await transport.send('BOOKING', webhookPayload)
    const statusCode = response.status === 'error' ? 502 : 202
    sendJson(res, statusCode, response)
  } catch {
    sendJson(res, 502, {
      status: 'error',
      requestId: crypto.randomUUID(),
      message: 'Failed to forward request to automation layer',
      code: 'AUTOMATION_FAILED',
    })
  }
}

export async function handleRoomService(
  req: IncomingMessage,
  res: ServerResponse,
  transport: WebhookTransport,
  env?: EnvConfig,
  idempotencyStore?: IdempotencyStore,
): Promise<void> {
  // Idempotency check: if X-Idempotency-Key is present and has been seen,
  // return the cached response without triggering another webhook call.
  const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined
  if (idempotencyKey && idempotencyStore) {
    const cached = idempotencyStore.get(idempotencyKey)
    if (cached) {
      sendJson(res, cached.responseStatus, cached.responseBody)
      return
    }
  }

  const payload = await readAndParse(req, res)
  if (payload === undefined) return

  const result = validateRoomServicePayload(payload)
  if (!result.ok) {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: `Validation failed: ${result.errors.map((e) => e.field).join(', ')}`,
      code: 'MISSING_FIELD',
    })
    return
  }

  // Session verification: QR token + active session required.
  const p = payload as Record<string, unknown>
  const qrToken = p.qrToken as string | undefined
  if (env && qrToken) {
    const tokenResult = verifyQrToken(qrToken, env.qrTokenSecret)
    if (tokenResult === undefined || tokenResult.roomId !== (p.roomNumber as number)) {
      sendJson(res, 403, {
        status: 'error',
        requestId: 'local-validation',
        message: 'Invalid, expired, or tampered QR token',
        code: 'AUTH_REQUIRED',
      })
      return
    }
    const session = verifySession(
      p.roomNumber as number,
      p.guestId as string,
      p.sessionId as string,
    )
    if (!session) {
      sendJson(res, 403, {
        status: 'error',
        requestId: 'local-validation',
        message: 'No active guest session for this room',
        code: 'AUTH_REQUIRED',
      })
      return
    }
  }

  // Rebuild the forwarded payload from server-side data: catalog item
  // names/prices always win over anything the client sent, so a forged
  // unitPrice/name can never reach Make.com or Airtable.
  const sanitizedItems: readonly OrderItem[] = result.items
  const total = sanitizedItems.reduce(
    (sum: number, item: OrderItem) => sum + item.unitPrice * item.quantity,
    0,
  )

  // Generate a stable orderId for tracking
  const orderId = crypto.randomUUID()
  const requestId = crypto.randomUUID()

  // Create the order in our store with status NEW
  const order = createOrder({
    orderId,
    requestId,
    roomNumber: p.roomNumber as number,
    guestId: p.guestId as string,
    sessionId: p.sessionId as string,
    items: sanitizedItems,
    total,
    notes: typeof p.notes === 'string' ? p.notes : undefined,
  })

  const sanitizedPayload = {
    ...payload,
    items: sanitizedItems,
    orderId: order.orderId,
    orderStatus: order.status,
    total,
  }

  try {
    const webhookPayload = sanitizedPayload as unknown as WebhookPayload
    const response = await transport.send('ROOM_SERVICE', webhookPayload)
    const statusCode = response.status === 'error' ? 502 : 202

    // Build the client response with order details
    const clientResponse = response.status === 'error'
      ? response
      : {
          ...response,
          data: {
            ...response.data,
            orderId: order.orderId,
            status: order.status,
            roomNumber: order.roomNumber,
            items: sanitizedItems,
            total,
            createdAt: new Date(order.createdAt).toISOString(),
          },
        }

    // Store response for idempotency replay
    if (idempotencyKey && idempotencyStore) {
      idempotencyStore.set(idempotencyKey, statusCode, clientResponse)
    }

    sendJson(res, statusCode, clientResponse)
  } catch {
    sendJson(res, 502, {
      status: 'error',
      requestId: crypto.randomUUID(),
      message: 'Failed to forward request to automation layer',
      code: 'AUTOMATION_FAILED',
    })
  }
}

export async function handleLateCheckout(
  req: IncomingMessage,
  res: ServerResponse,
  transport: WebhookTransport,
  env?: EnvConfig,
): Promise<void> {
  const payload = await readAndParse(req, res)
  if (payload === undefined) return

  const result = validateLateCheckoutPayload(payload)
  if (!result.ok) {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: `Validation failed: ${result.errors.map((e) => e.field).join(', ')}`,
      code: 'MISSING_FIELD',
    })
    return
  }

  // Session verification: QR token + active session required.
  const p = payload as Record<string, unknown>
  const qrToken = p.qrToken as string | undefined
  if (env && qrToken) {
    const tokenResult = verifyQrToken(qrToken, env.qrTokenSecret)
    if (tokenResult === undefined || tokenResult.roomId !== (p.roomNumber as number)) {
      sendJson(res, 403, {
        status: 'error',
        requestId: 'local-validation',
        message: 'Invalid, expired, or tampered QR token',
        code: 'AUTH_REQUIRED',
      })
      return
    }
    const session = verifySession(
      p.roomNumber as number,
      p.guestId as string,
      p.sessionId as string,
    )
    if (!session) {
      sendJson(res, 403, {
        status: 'error',
        requestId: 'local-validation',
        message: 'No active guest session for this room',
        code: 'AUTH_REQUIRED',
      })
      return
    }
  }

  try {
    const webhookPayload = payload as WebhookPayload
    const response = await transport.send('LATE_CHECKOUT', webhookPayload)
    const statusCode = response.status === 'error' ? 502 : 202
    sendJson(res, statusCode, response)
  } catch {
    sendJson(res, 502, {
      status: 'error',
      requestId: crypto.randomUUID(),
      message: 'Failed to forward request to automation layer',
      code: 'AUTOMATION_FAILED',
    })
  }
}

/**
 * Guest order-status query. Verifies the caller owns the order via
 * QR token + active session before returning order information.
 */
export async function handleOrderStatus(
  req: IncomingMessage,
  res: ServerResponse,
  env?: EnvConfig,
): Promise<void> {
  const payload = await readAndParse(req, res)
  if (payload === undefined) return

  const p = payload as Record<string, unknown>
  const orderId = p.orderId as string | undefined
  if (typeof orderId !== 'string' || orderId.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'orderId required',
      code: 'MISSING_FIELD',
    })
    return
  }

  if (!env) {
    sendJson(res, 500, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Server configuration error',
      code: 'INTERNAL_ERROR',
    })
    return
  }

  const qrToken = p.qrToken as string | undefined
  if (typeof qrToken !== 'string' || qrToken.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'qrToken required for order status lookup',
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

  const session = verifySession(
    tokenResult.roomId,
    p.guestId as string,
    p.sessionId as string,
  )
  if (!session) {
    sendJson(res, 403, {
      status: 'error',
      requestId: 'local-validation',
      message: 'No active guest session for this room',
      code: 'AUTH_REQUIRED',
    })
    return
  }

  const order = getOrder(orderId)
  if (!order) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Order not found',
      code: 'NOT_FOUND',
    })
    return
  }

  // Ownership check: order must belong to the authenticated guest's room and session
  if (order.roomNumber !== tokenResult.roomId) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Order not found',
      code: 'NOT_FOUND',
    })
    return
  }

  if (order.guestId !== p.guestId || order.sessionId !== p.sessionId) {
    sendJson(res, 404, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Order not found',
      code: 'NOT_FOUND',
    })
    return
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Order found',
    data: {
      orderId: order.orderId,
      status: order.status,
      roomNumber: order.roomNumber,
      items: order.items,
      total: order.total,
      notes: order.notes,
      createdAt: new Date(order.createdAt).toISOString(),
      updatedAt: new Date(order.updatedAt).toISOString(),
    },
  })
}

/**
 * Admin order-status update. Requires Bearer token authentication.
 * Validates status transitions before applying.
 */
export async function handleUpdateOrderStatus(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const payload = await readAndParse(req, res)
  if (payload === undefined) return

  const body = payload as Record<string, unknown>
  const orderId = body.orderId as string | undefined
  const newStatus = body.status as string | undefined

  if (typeof orderId !== 'string' || orderId.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'orderId required',
      code: 'MISSING_FIELD',
    })
    return
  }

  if (typeof newStatus !== 'string' || newStatus.trim() === '') {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'status required',
      code: 'MISSING_FIELD',
    })
    return
  }

  const result = updateOrderStatus(orderId, newStatus)
  if (!result.ok) {
    const isNotFound = result.error.includes('not found')
    sendJson(res, isNotFound ? 404 : 400, {
      status: 'error',
      requestId: 'local-validation',
      message: result.error,
      code: isNotFound ? 'NOT_FOUND' : 'INVALID_REQUEST',
    })
    return
  }

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: 'Order status updated',
    data: {
      orderId: result.order.orderId,
      status: result.order.status,
      updatedAt: new Date(result.order.updatedAt).toISOString(),
    },
  })
}

/**
 * Admin order listing. Requires Bearer token authentication.
 * Returns safe operational data only — no guestId, sessionId, or request internals.
 * Optional query param `status` filters by order status.
 */
export async function handleListOrders(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Parse optional status filter from query string
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const statusFilter = url.searchParams.get('status') ?? undefined

  const orders = listOrders(statusFilter)

  sendJson(res, 200, {
    status: 'ok',
    requestId: crypto.randomUUID(),
    message: `${orders.length} order(s) found`,
    data: { orders },
  })
}
