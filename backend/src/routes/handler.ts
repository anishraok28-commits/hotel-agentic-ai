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
): Promise<void> {
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

  // Rebuild the forwarded payload from server-side data: catalog item
  // names/prices always win over anything the client sent, so a forged
  // unitPrice/name can never reach Make.com or Airtable.
  const p = payload as Record<string, unknown>
  const sanitizedPayload = {
    ...p,
    items: result.items,
  }

  try {
    const webhookPayload = sanitizedPayload as unknown as WebhookPayload
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
