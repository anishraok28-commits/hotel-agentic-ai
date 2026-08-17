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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

export async function handleConcierge(
  req: IncomingMessage,
  res: ServerResponse,
  transport: WebhookTransport,
): Promise<void> {
  const raw = await readBody(req)
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid JSON body',
      code: 'INVALID_REQUEST',
    })
    return
  }

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
): Promise<void> {
  const raw = await readBody(req)
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid JSON body',
      code: 'INVALID_REQUEST',
    })
    return
  }

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

  try {
    const webhookPayload = payload as WebhookPayload
    const response = await transport.send('ROOM_SERVICE', webhookPayload)
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

export async function handleLateCheckout(
  req: IncomingMessage,
  res: ServerResponse,
  transport: WebhookTransport,
): Promise<void> {
  const raw = await readBody(req)
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    sendJson(res, 400, {
      status: 'error',
      requestId: 'local-validation',
      message: 'Invalid JSON body',
      code: 'INVALID_REQUEST',
    })
    return
  }

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
