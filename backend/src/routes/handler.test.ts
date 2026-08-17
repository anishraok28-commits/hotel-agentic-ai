import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, it, expect, vi } from 'vitest'
import { handleConcierge } from './handler.js'
import type { WebhookTransport, WebhookPayload } from '../webhook/transport.js'

interface CapturedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

function makeRequest(body: unknown): IncomingMessage {
  const raw = Buffer.from(JSON.stringify(body))
  const req = new EventEmitter() as unknown as IncomingMessage
  queueMicrotask(() => {
    req.emit('data', raw)
    req.emit('end')
  })
  return req
}

function makeResponse(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: '' }
  const res = new EventEmitter() as unknown as ServerResponse
  res.writeHead = ((status: number, headers?: unknown) => {
    captured.status = status
    captured.headers = (headers as Record<string, string> | undefined) ?? {}
    return res
  }) as ServerResponse['writeHead']
  res.end = ((chunk?: unknown) => {
    captured.body = String(chunk ?? '')
    return res
  }) as ServerResponse['end']
  return { res, captured }
}

const validConciergePayload = {
  guestId: 'guest-123',
  sessionId: 'session-456',
  roomNumber: 214,
  request: 'Restaurant recommendations for dinner',
  mode: 'AI_CONCIERGE',
}

function transportReturning(response: unknown): WebhookTransport {
  return { send: vi.fn().mockResolvedValue(response) }
}

describe('handleConcierge', () => {
  it('forwards the booking payload to the BOOKING workflow', async () => {
    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-req-1',
      message: 'Accepted',
      data: { workflow: 'BOOKING', status: 'accepted' },
    })
    const { res, captured } = makeResponse()

    await handleConcierge(makeRequest(validConciergePayload), res, transport)

    expect(transport.send).toHaveBeenCalledOnce()
    expect(transport.send).toHaveBeenCalledWith('BOOKING', validConciergePayload as WebhookPayload)
    expect(captured.status).toBe(202)
    expect(JSON.parse(captured.body)).toMatchObject({
      status: 'accepted',
      requestId: 'make-req-1',
      message: 'Accepted',
    })
  })

  it('maps a Make.com failure to HTTP 502 AUTOMATION_FAILED', async () => {
    const transport = transportReturning({
      status: 'error',
      requestId: 'make-req-err',
      message: 'Make.com webhook timed out',
      code: 'AUTOMATION_FAILED',
    })
    const { res, captured } = makeResponse()

    await handleConcierge(makeRequest(validConciergePayload), res, transport)

    expect(transport.send).toHaveBeenCalledWith('BOOKING', validConciergePayload as WebhookPayload)
    expect(captured.status).toBe(502)
    expect(JSON.parse(captured.body)).toMatchObject({
      status: 'error',
      code: 'AUTOMATION_FAILED',
    })
  })

  it('rejects a payload with a non-AI_CONCIERGE mode without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleConcierge(
      makeRequest({ ...validConciergePayload, mode: 'QR_ROOM_SERVICE' }),
      res,
      transport,
    )

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'MISSING_FIELD' })
  })

  it('rejects a missing booking field without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()
    const { request: _request, ...missingRequest } = validConciergePayload
    void _request

    await handleConcierge(makeRequest(missingRequest), res, transport)

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'MISSING_FIELD' })
  })

  it('rejects malformed JSON without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()
    const req = new EventEmitter() as unknown as IncomingMessage
    queueMicrotask(() => {
      req.emit('data', Buffer.from('{ not json'))
      req.emit('end')
    })

    await handleConcierge(req, res, transport)

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('maps an unexpected forwarding failure to HTTP 502 AUTOMATION_FAILED', async () => {
    const transport: WebhookTransport = {
      send: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const { res, captured } = makeResponse()

    await handleConcierge(makeRequest(validConciergePayload), res, transport)

    expect(captured.status).toBe(502)
    expect(JSON.parse(captured.body)).toMatchObject({
      status: 'error',
      code: 'AUTOMATION_FAILED',
    })
  })
})