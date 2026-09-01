import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submit, checkOrderStatus, resetMockOrderState } from '@/api/mockTransport'

beforeEach(() => {
  resetMockOrderState()
})

vi.mock('@/config/appConfig', () => ({
  MOCK_API_ENABLED: false,
  appConfig: { apiBaseUrl: 'http://test.local', environment: 'test' },
}))

const postJson = (
  body: unknown,
  ok: boolean,
  status = ok ? 200 : 400,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function lastFetchCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
  return {
    url,
    method: opts.method,
    headers: opts.headers as Record<string, string>,
    body: opts.body as string,
  }
}

describe('submit (real Backend path)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('returns the success response for a 2xx with a valid shape', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'accepted', requestId: 'r1', message: 'ok', data: {} },
        true,
        202,
      ),
    )
    await expect(submit('POST /api/room-service', {})).resolves.toMatchObject({
      status: 'accepted',
      requestId: 'r1',
    })
  })

  it('surfaces the backend error body for a non-ok HTTP status', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        {
          status: 'error',
          requestId: 'b1',
          message: 'roomNumber invalid',
          code: 'INVALID_REQUEST',
        },
        false,
        400,
      ),
    )
    await expect(submit('POST /api/room-service', {})).resolves.toMatchObject({
      status: 'error',
      code: 'INVALID_REQUEST',
      message: 'roomNumber invalid',
    })
  })

  it('returns a local error when a non-ok response has no parseable error body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>oops</html>', { status: 500 }))
    await expect(submit('POST /api/room-service', {})).resolves.toMatchObject({
      status: 'error',
      code: 'INTERNAL_ERROR',
      requestId: 'local-http',
    })
  })

  it('returns a local error when a 2xx response has an unexpected shape', async () => {
    fetchMock.mockResolvedValue(postJson({ unexpected: true }, true, 200))
    await expect(submit('POST /api/room-service', {})).resolves.toMatchObject({
      status: 'error',
      code: 'INTERNAL_ERROR',
      requestId: 'local-parse',
    })
  })
})

describe('fetch request shape', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue(
      postJson({ status: 'accepted', requestId: 'r1', message: 'ok', data: {} }, true, 202),
    )
  })

  it('sends POST to /api/concierge with correct URL', async () => {
    await submit('POST /api/concierge', { guestId: 'g1' })
    const call = lastFetchCall(fetchMock)
    expect(call.url).toBe('http://test.local/api/concierge')
    expect(call.method).toBe('POST')
  })

  it('sends POST to /api/room-service with correct URL', async () => {
    await submit('POST /api/room-service', { items: [] })
    const call = lastFetchCall(fetchMock)
    expect(call.url).toBe('http://test.local/api/room-service')
    expect(call.method).toBe('POST')
  })

  it('sends POST to /api/late-checkout with correct URL', async () => {
    await submit('POST /api/late-checkout', { requestedTime: '2026-01-01T12:00:00Z' })
    const call = lastFetchCall(fetchMock)
    expect(call.url).toBe('http://test.local/api/late-checkout')
    expect(call.method).toBe('POST')
  })

  it('includes Content-Type: application/json header', async () => {
    await submit('POST /api/concierge', { guestId: 'g1' })
    const call = lastFetchCall(fetchMock)
    expect(call.headers['Content-Type']).toBe('application/json')
  })

  it('does not include Authorization header on guest routes', async () => {
    await submit('POST /api/concierge', { guestId: 'g1' })
    const call = lastFetchCall(fetchMock)
    expect(call.headers['Authorization']).toBeUndefined()
  })

  it('sends the payload as JSON-stringified body', async () => {
    const payload = { guestId: 'g1', roomNumber: 214, mode: 'AI_CONCIERGE' }
    await submit('POST /api/concierge', payload)
    const call = lastFetchCall(fetchMock)
    expect(JSON.parse(call.body)).toEqual(payload)
  })
})

describe('HTTP error responses', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('surfaces AUTH_REQUIRED from HTTP 401', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'error', requestId: 'b1', message: 'Authentication required', code: 'AUTH_REQUIRED' },
        false,
        401,
      ),
    )
    const result = await submit('POST /api/concierge', { guestId: 'g1' })
    expect(result).toMatchObject({ status: 'error', code: 'AUTH_REQUIRED' })
  })

  it('surfaces RATE_LIMITED from HTTP 429', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'error', requestId: 'b2', message: 'Too many requests', code: 'RATE_LIMITED' },
        false,
        429,
      ),
    )
    const result = await submit('POST /api/room-service', { items: [] })
    expect(result).toMatchObject({ status: 'error', code: 'RATE_LIMITED' })
  })

  it('surfaces AUTOMATION_FAILED from HTTP 502', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'error', requestId: 'b3', message: 'Automation failed', code: 'AUTOMATION_FAILED' },
        false,
        502,
      ),
    )
    const result = await submit('POST /api/late-checkout', { requestedTime: '2026-01-01T12:00:00Z' })
    expect(result).toMatchObject({ status: 'error', code: 'AUTOMATION_FAILED' })
  })

  it('returns INTERNAL_ERROR for non-ok response without parseable error body', async () => {
    fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))
    const result = await submit('POST /api/concierge', { guestId: 'g1' })
    expect(result).toMatchObject({ status: 'error', code: 'INTERNAL_ERROR', requestId: 'local-http' })
  })
})

describe('network and timeout failures', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('returns AUTOMATION_FAILED on network error', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'))
    const result = await submit('POST /api/concierge', { guestId: 'g1' })
    expect(result).toMatchObject({
      status: 'error',
      code: 'AUTOMATION_FAILED',
      requestId: 'local-network',
      message: 'Failed to reach the backend service',
    })
  })

  it('returns INTERNAL_ERROR on timeout (AbortError)', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'))
    const result = await submit('POST /api/room-service', { items: [] })
    expect(result).toMatchObject({
      status: 'error',
      code: 'INTERNAL_ERROR',
      requestId: 'local-timeout',
      message: 'The request timed out. Please try again.',
    })
  })
})

describe('checkOrderStatus (real Backend path)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('sends POST to /api/order/status with orderId in body', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'accepted', requestId: 'r1', message: 'ok', data: { status: 'PREPARING' } },
        true,
        200,
      ),
    )
    await checkOrderStatus('order-123')
    const call = lastFetchCall(fetchMock)
    expect(call.url).toBe('http://test.local/api/order/status')
    expect(call.method).toBe('POST')
    expect(JSON.parse(call.body)).toEqual({ orderId: 'order-123' })
  })

  it('returns the success response for a 2xx', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'accepted', requestId: 'r1', message: 'ok', data: { status: 'READY' } },
        true,
        200,
      ),
    )
    const result = await checkOrderStatus('order-456')
    expect(result).toMatchObject({ status: 'accepted', requestId: 'r1' })
  })

  it('returns an error for non-ok HTTP status', async () => {
    fetchMock.mockResolvedValue(
      postJson(
        { status: 'error', requestId: 'b1', message: 'Not found', code: 'NOT_FOUND' },
        false,
        404,
      ),
    )
    const result = await checkOrderStatus('order-nope')
    expect(result).toMatchObject({ status: 'error', code: 'NOT_FOUND' })
  })
})
