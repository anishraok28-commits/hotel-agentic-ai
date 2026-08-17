import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRealTransport } from './realTransport.js'
import type { EnvConfig } from '../config/env.js'
import type { WebhookErrorResponse } from './transport.js'

function expectError(result: unknown): WebhookErrorResponse {
  expect((result as WebhookErrorResponse).status).toBe('error')
  return result as WebhookErrorResponse
}

const env: EnvConfig = {
  port: 3000,
  nodeEnv: 'local',
  makeBookingWebhookUrl: 'https://hook.make.com/booking-test',
  makeRoomServiceWebhookUrl: 'https://hook.make.com/room-service-test',
  makeLateCheckoutWebhookUrl: 'https://hook.make.com/late-checkout-test',
}

const payload = {
  guestId: 'guest-1',
  sessionId: 'session-1',
  roomNumber: 100,
  mode: 'AI_CONCIERGE',
}

function mockFetchSuccess(body: Record<string, unknown> = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      requestId: 'make-req-1',
      message: 'Accepted',
      data: body,
    }),
  })
}

function mockFetchNonOk(status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message: 'Error' }),
  })
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('fetch failed'))
}

function mockFetchTimeout() {
  const abortError = new DOMException('The operation was aborted.', 'AbortError')
  return vi.fn().mockRejectedValue(abortError)
}

function mockFetchInvalidJson() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => { throw new Error('Unexpected token') },
  })
}

describe('realTransport', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends POST with correct Content-Type to booking URL', async () => {
    globalThis.fetch = mockFetchSuccess()
    const transport = createRealTransport(env)

    await transport.send('BOOKING', payload)

    expect(globalThis.fetch).toHaveBeenCalledOnce()
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://hook.make.com/booking-test')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(opts.body)).toEqual(payload)
  })

  it('sends POST to room-service URL for ROOM_SERVICE workflow', async () => {
    globalThis.fetch = mockFetchSuccess()
    const transport = createRealTransport(env)

    await transport.send('ROOM_SERVICE', { ...payload, mode: 'QR_ROOM_SERVICE' })

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://hook.make.com/room-service-test')
  })

  it('sends POST to late-checkout URL for LATE_CHECKOUT workflow', async () => {
    globalThis.fetch = mockFetchSuccess()
    const transport = createRealTransport(env)

    await transport.send('LATE_CHECKOUT', { ...payload, mode: 'LATE_CHECKOUT' })

    const [url] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('https://hook.make.com/late-checkout-test')
  })

  it('returns accepted with Make.com response data on success', async () => {
    globalThis.fetch = mockFetchSuccess({ workflow: 'BOOKING' })
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    expect(result.status).toBe('accepted')
    expect(result.requestId).toBe('make-req-1')
    expect(result.message).toBe('Accepted')
  })

  it('returns AUTOMATION_FAILED error on non-2xx response', async () => {
    globalThis.fetch = mockFetchNonOk(500)
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    const err = expectError(result)
    expect(err.code).toBe('AUTOMATION_FAILED')
    expect(err.message).toContain('500')
  })

  it('returns AUTOMATION_FAILED error on network failure', async () => {
    globalThis.fetch = mockFetchNetworkError()
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    const err = expectError(result)
    expect(err.code).toBe('AUTOMATION_FAILED')
    expect(err.message).toContain('failed')
  })

  it('returns AUTOMATION_FAILED error on timeout', async () => {
    globalThis.fetch = mockFetchTimeout()
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    const err = expectError(result)
    expect(err.code).toBe('AUTOMATION_FAILED')
    expect(err.message).toContain('timed out')
  })

  it('returns AUTOMATION_FAILED error when Make.com returns invalid JSON', async () => {
    globalThis.fetch = mockFetchInvalidJson()
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    const err = expectError(result)
    expect(err.code).toBe('AUTOMATION_FAILED')
    expect(err.message).toContain('invalid JSON')
  })

  it('does not leak webhook URL in error messages', async () => {
    globalThis.fetch = mockFetchNonOk(500)
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    const err = expectError(result)
    expect(err.message).not.toContain('hook.make.com')
    expect(err.message).not.toContain('booking-test')
  })

  it('does not leak webhook URL on network error', async () => {
    globalThis.fetch = mockFetchNetworkError()
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    const err = expectError(result)
    expect(err.message).not.toContain('hook.make.com')
  })

  it('uses fallback requestId when Make.com omits it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ message: 'OK' }),
    })
    const transport = createRealTransport(env)

    const result = await transport.send('BOOKING', payload)

    expect(result.status).toBe('accepted')
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
