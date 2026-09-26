import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, it, expect, vi } from 'vitest'
import { handleConcierge, handleRoomService, handleLateCheckout } from './handler.js'
import type { WebhookTransport, WebhookPayload } from '../webhook/transport.js'
import type { IdempotencyStore } from '../middleware/idempotency.js'

interface CapturedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

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
    req.destroy = () => req
    req.pause = () => req
    queueMicrotask(() => {
      req.emit('data', Buffer.from('{ not json'))
      req.emit('end')
    })

    await handleConcierge(req, res, transport)

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('rejects an oversized body with 413 without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()
    const oversized = { ...validConciergePayload, request: 'x'.repeat(60 * 1024) }
    const req = new EventEmitter() as unknown as IncomingMessage
    req.destroy = () => req
    req.pause = () => req
    queueMicrotask(() => {
      req.emit('data', Buffer.from(JSON.stringify(oversized)))
      req.emit('end')
    })

    await handleConcierge(req, res, transport)

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(413)
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

describe('handleRoomService', () => {
  const validRoomServicePayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    items: [
      { itemId: 'menu.001', name: 'Club Sandwich', quantity: 2, unitPrice: 1200 },
    ],
    notes: 'No onions',
    mode: 'QR_ROOM_SERVICE',
  }

  it('replaces client-sent name and unitPrice with catalog values', async () => {
    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-req-1',
      message: 'Accepted',
      data: { workflow: 'ROOM_SERVICE', status: 'accepted' },
    })
    const { res, captured } = makeResponse()

    await handleRoomService(
      makeRequest({
        ...validRoomServicePayload,
        items: [
          { itemId: 'menu.001', name: 'Forged Name', quantity: 2, unitPrice: 1 },
        ],
      }),
      res,
      transport,
    )

    expect(transport.send).toHaveBeenCalledOnce()
    const [, forwarded] = (transport.send as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      WebhookPayload,
    ]
    expect(forwarded.items).toEqual([
      { itemId: 'menu.001', name: 'Club Sandwich', quantity: 2, unitPrice: 1200 },
    ])
    expect(captured.status).toBe(202)
  })

  it('rejects an order containing an item with a forged unitPrice of 0', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleRoomService(
      makeRequest({
        ...validRoomServicePayload,
        items: [
          { itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 0 },
        ],
      }),
      res,
      transport,
    )

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'MISSING_FIELD' })
  })

  it('rejects an order containing an unknown menu item', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleRoomService(
      makeRequest({
        ...validRoomServicePayload,
        items: [
          { itemId: 'menu.999', name: 'Fake Item', quantity: 1, unitPrice: 100 },
        ],
      }),
      res,
      transport,
    )

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
  })

  it('returns 202 with order data when Make.com succeeds', async () => {
    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-req-rs-ok',
      message: 'Accepted',
      data: { workflow: 'ROOM_SERVICE', status: 'accepted' },
    })
    const { res, captured } = makeResponse()

    await handleRoomService(makeRequest(validRoomServicePayload), res, transport)

    expect(captured.status).toBe(202)
    const body = JSON.parse(captured.body)
    expect(body.status).toBe('accepted')
    expect(body.data).toBeDefined()
    expect(body.data.orderId).toBeDefined()
    expect(body.data.status).toBe('NEW')
    expect(body.data.roomNumber).toBe(214)
    expect(body.data.items).toEqual([
      { itemId: 'menu.001', name: 'Club Sandwich', quantity: 2, unitPrice: 1200 },
    ])
    expect(body.data.total).toBe(2400)
    expect(body.data.automationFailed).toBeUndefined()
  })

  it('returns 202 with automationFailed when Make.com fails', async () => {
    const transport = transportReturning({
      status: 'error',
      requestId: 'make-req-rs-err',
      message: 'Make.com webhook timed out',
      code: 'AUTOMATION_FAILED',
    })
    const { res, captured } = makeResponse()

    await handleRoomService(makeRequest(validRoomServicePayload), res, transport)

    expect(transport.send).toHaveBeenCalledWith('ROOM_SERVICE', expect.objectContaining({ mode: 'QR_ROOM_SERVICE' }))
    expect(captured.status).toBe(202)
    const body = JSON.parse(captured.body)
    expect(body).toMatchObject({
      status: 'accepted',
      data: expect.objectContaining({
        orderId: expect.any(String),
        status: 'NEW',
        roomNumber: 214,
        automationFailed: true,
      }),
    })
  })

  it('returns 202 with automationFailed when transport throws', async () => {
    const transport: WebhookTransport = {
      send: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const { res, captured } = makeResponse()

    await handleRoomService(makeRequest(validRoomServicePayload), res, transport)

    expect(captured.status).toBe(202)
    const body = JSON.parse(captured.body)
    expect(body).toMatchObject({
      status: 'accepted',
      data: expect.objectContaining({
        orderId: expect.any(String),
        status: 'NEW',
        roomNumber: 214,
        automationFailed: true,
      }),
    })
  })

  it('includes full order data with automationFailed when Make.com fails', async () => {
    const transport = transportReturning({
      status: 'error',
      requestId: 'make-req-rs-err-2',
      message: 'Make.com webhook failed',
      code: 'AUTOMATION_FAILED',
    })
    const { res, captured } = makeResponse()

    await handleRoomService(makeRequest(validRoomServicePayload), res, transport)

    expect(captured.status).toBe(202)
    const body = JSON.parse(captured.body)
    expect(body.status).toBe('accepted')
    expect(body.data).toBeDefined()
    expect(body.data.orderId).toBeDefined()
    expect(body.data.status).toBe('NEW')
    expect(body.data.roomNumber).toBe(214)
    expect(body.data.items).toEqual([
      { itemId: 'menu.001', name: 'Club Sandwich', quantity: 2, unitPrice: 1200 },
    ])
    expect(body.data.total).toBe(2400)
    expect(body.data.automationFailed).toBe(true)
  })

  it('order is retrievable after Make.com failure', async () => {
    const { getOrder } = await import('../order/store.js')
    const transport = transportReturning({
      status: 'error',
      requestId: 'make-req-rs-persist',
      message: 'Make.com webhook timed out',
      code: 'AUTOMATION_FAILED',
    })
    const { res, captured } = makeResponse()

    await handleRoomService(makeRequest(validRoomServicePayload), res, transport)

    expect(captured.status).toBe(202)
    const body = JSON.parse(captured.body)
    const orderId = body.data.orderId as string
    const order = getOrder(orderId)
    expect(order).toBeDefined()
    expect(order?.status).toBe('NEW')
    expect(order?.roomNumber).toBe(214)
    expect(order?.total).toBe(2400)
  })
})

describe('handleLateCheckout', () => {
  const validLateCheckoutPayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    requestedTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    mode: 'LATE_CHECKOUT',
  }

  it('forwards the payload to the LATE_CHECKOUT workflow', async () => {
    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-req-lc-1',
      message: 'Accepted',
      data: { workflow: 'LATE_CHECKOUT', status: 'accepted' },
    })
    const { res, captured } = makeResponse()

    await handleLateCheckout(makeRequest(validLateCheckoutPayload), res, transport)

    expect(transport.send).toHaveBeenCalledOnce()
    expect(transport.send).toHaveBeenCalledWith(
      'LATE_CHECKOUT',
      validLateCheckoutPayload as WebhookPayload,
    )
    expect(captured.status).toBe(202)
    expect(JSON.parse(captured.body)).toMatchObject({
      status: 'accepted',
      requestId: 'make-req-lc-1',
      message: 'Accepted',
    })
  })

  it('maps a Make.com failure to HTTP 502 AUTOMATION_FAILED', async () => {
    const transport = transportReturning({
      status: 'error',
      requestId: 'make-req-lc-err',
      message: 'Make.com webhook timed out',
      code: 'AUTOMATION_FAILED',
    })
    const { res, captured } = makeResponse()

    await handleLateCheckout(makeRequest(validLateCheckoutPayload), res, transport)

    expect(transport.send).toHaveBeenCalledWith(
      'LATE_CHECKOUT',
      validLateCheckoutPayload as WebhookPayload,
    )
    expect(captured.status).toBe(502)
    expect(JSON.parse(captured.body)).toMatchObject({
      status: 'error',
      code: 'AUTOMATION_FAILED',
    })
  })

  it('rejects a payload with a non-LATE_CHECKOUT mode without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()

    await handleLateCheckout(
      makeRequest({ ...validLateCheckoutPayload, mode: 'AI_CONCIERGE' }),
      res,
      transport,
    )

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'MISSING_FIELD' })
  })

  it('rejects a missing requestedTime field without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()
    const { requestedTime: _t, ...missingTime } = validLateCheckoutPayload
    void _t

    await handleLateCheckout(makeRequest(missingTime), res, transport)

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'MISSING_FIELD' })
  })

  it('rejects a past requestedTime without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()
    const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    await handleLateCheckout(
      makeRequest({ ...validLateCheckoutPayload, requestedTime: pastTime }),
      res,
      transport,
    )

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'MISSING_FIELD' })
  })

  it('rejects malformed JSON without forwarding', async () => {
    const transport = transportReturning({ status: 'accepted' })
    const { res, captured } = makeResponse()
    const req = new EventEmitter() as unknown as IncomingMessage
    req.destroy = () => req
    req.pause = () => req
    queueMicrotask(() => {
      req.emit('data', Buffer.from('{ not json'))
      req.emit('end')
    })

    await handleLateCheckout(req, res, transport)

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(400)
    expect(JSON.parse(captured.body)).toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('maps an unexpected forwarding failure to HTTP 502 AUTOMATION_FAILED', async () => {
    const transport: WebhookTransport = {
      send: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const { res, captured } = makeResponse()

    await handleLateCheckout(makeRequest(validLateCheckoutPayload), res, transport)

    expect(captured.status).toBe(502)
    expect(JSON.parse(captured.body)).toMatchObject({
      status: 'error',
      code: 'AUTOMATION_FAILED',
    })
  })
})

describe('handleRoomService idempotency', () => {
  function createMockIdempotencyStore(): IdempotencyStore & {
    entries: Map<string, { responseStatus: number; responseBody: unknown }>
  } {
    const entries = new Map<string, { responseStatus: number; responseBody: unknown }>()
    return {
      entries,
      get(key: string) {
        const entry = entries.get(key)
        return entry
          ? { responseStatus: entry.responseStatus, responseBody: entry.responseBody, createdAt: Date.now() }
          : undefined
      },
      set(key: string, status: number, body: unknown) {
        entries.set(key, { responseStatus: status, responseBody: body })
      },
    }
  }

  const validRoomServicePayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    items: [
      { itemId: 'menu.001', name: 'Club Sandwich', quantity: 2, unitPrice: 1200 },
    ],
    notes: 'No onions',
    mode: 'QR_ROOM_SERVICE',
  }

  it('returns cached response on duplicate idempotency key', async () => {
    const store = createMockIdempotencyStore()
    const cachedResponse = {
      status: 'accepted',
      requestId: 'cached-rs-1',
      message: 'Cached room service',
      data: { orderId: 'cached-order-1', status: 'NEW' },
    }
    store.set('idem-rs-1', 202, cachedResponse)

    const transport = transportReturning({ status: 'accepted', requestId: 'new', message: 'ok', data: {} })
    const { res, captured } = makeResponse()

    await handleRoomService(
      makeRequest(validRoomServicePayload, { 'x-idempotency-key': 'idem-rs-1' }),
      res,
      transport,
      undefined,
      store,
    )

    expect(transport.send).not.toHaveBeenCalled()
    expect(captured.status).toBe(202)
    expect(JSON.parse(captured.body)).toMatchObject({ requestId: 'cached-rs-1' })
  })

  it('processes request and stores response on first call', async () => {
    const store = createMockIdempotencyStore()
    const transport = transportReturning({
      status: 'accepted',
      requestId: 'make-rs-1',
      message: 'Accepted',
      data: { workflow: 'ROOM_SERVICE' },
    })
    const { res, captured } = makeResponse()

    await handleRoomService(
      makeRequest(validRoomServicePayload, { 'x-idempotency-key': 'idem-rs-new' }),
      res,
      transport,
      undefined,
      store,
    )

    expect(transport.send).toHaveBeenCalledOnce()
    expect(captured.status).toBe(202)
    expect(store.entries.has('idem-rs-new')).toBe(true)
  })

  it('caches automation failure for replay prevention', async () => {
    const store = createMockIdempotencyStore()
    const transport = transportReturning({
      status: 'error',
      requestId: 'make-rs-err',
      message: 'Make.com webhook timed out',
      code: 'AUTOMATION_FAILED',
    })
    const { res, captured } = makeResponse()

    await handleRoomService(
      makeRequest(validRoomServicePayload, { 'x-idempotency-key': 'idem-rs-fail' }),
      res,
      transport,
      undefined,
      store,
    )

    expect(captured.status).toBe(202)
    expect(store.entries.has('idem-rs-fail')).toBe(true)
    const cached = store.entries.get('idem-rs-fail')
    expect(cached?.responseStatus).toBe(202)
  })
})