import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submit, checkOrderStatus, resetMockOrderState, fetchCurrentStay, checkoutRoom, listRooms, createRoom } from '@/api/mockTransport'

beforeEach(() => {
  resetMockOrderState()
})

vi.mock('@/config/appConfig', () => ({
  MOCK_API_ENABLED: false,
  appConfig: { apiBaseUrl: 'http://test.local', environment: 'test' },
}))

const mockGetAuthToken = vi.fn()
vi.mock('@/auth/AuthContext', () => ({
  getAuthToken: (...args: unknown[]) => mockGetAuthToken(...args),
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
    expect(JSON.parse(call.body)).toEqual({ orderId: 'order-123', qrToken: '', guestId: '', sessionId: '' })
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

describe('fetchCurrentStay', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('returns stay data from backend', async () => {
    fetchMock.mockResolvedValue(
      postJson({
        status: 'ok',
        requestId: 'test-stay-001',
        message: 'Active stay retrieved',
        data: {
          stay: { stayId: 's1', roomNumber: 201, status: 'active', checkedInAt: '2026-01-01T00:00:00Z', checkedOutAt: null },
          session: { roomId: 201, guestId: 'g1', sessionId: 'sess1', expiresAt: '2026-01-02T00:00:00Z' },
          orders: [],
        },
      }, true),
    )
    const result = await fetchCurrentStay('test-token')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.data.stay).not.toBeNull()
      expect(result.data.stay?.roomNumber).toBe(201)
      expect(result.data.orders).toEqual([])
    }
  })

  it('returns null stay on 404', async () => {
    fetchMock.mockResolvedValue(
      postJson({ status: 'error', message: 'Not found', code: 'NOT_FOUND' }, false, 404),
    )
    const result = await fetchCurrentStay('test-token')
    expect(result.status).toBe('error')
  })
})

describe('checkoutRoom', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('sends checkout request and returns ok', async () => {
    fetchMock.mockResolvedValue(
      postJson({ status: 'ok', message: 'Room checked out.' }, true),
    )
    const result = await checkoutRoom(301)
    expect(result.ok).toBe(true)
    const call = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(call[0]).toContain('/api/session/checkout')
    expect(call[1].method).toBe('POST')
  })

  it('returns error on failure', async () => {
    fetchMock.mockResolvedValue(
      postJson({ status: 'error', message: 'No active stay' }, false, 404),
    )
    const result = await checkoutRoom(999)
    expect(result.ok).toBe(false)
    expect(result.message).toBe('No active stay')
  })
})

describe('room management uses session token (not VITE_SERVICE_TOKEN)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    mockGetAuthToken.mockReset()
  })

  it('listRooms sends Authorization from getAuthToken, not appConfig.serviceToken', async () => {
    mockGetAuthToken.mockReturnValue('session-jwt-token-abc')
    fetchMock.mockResolvedValue(
      postJson({ status: 'ok', message: 'ok', data: { rooms: [] } }, true),
    )
    await listRooms()
    const call = lastFetchCall(fetchMock)
    expect(call.headers['Authorization']).toBe('Bearer session-jwt-token-abc')
  })

  it('listRooms omits Authorization when no session token exists', async () => {
    mockGetAuthToken.mockReturnValue(null)
    fetchMock.mockResolvedValue(
      postJson({ status: 'ok', message: 'ok', data: { rooms: [] } }, true),
    )
    await listRooms()
    const call = lastFetchCall(fetchMock)
    expect(call.headers['Authorization']).toBeUndefined()
  })

  it('createRoom sends Authorization from getAuthToken', async () => {
    mockGetAuthToken.mockReturnValue('session-jwt-token-xyz')
    fetchMock.mockResolvedValue(
      postJson({ status: 'ok', message: 'ok', data: { room: { roomNumber: 101 } } }, true),
    )
    await createRoom(101)
    const call = lastFetchCall(fetchMock)
    expect(call.headers['Authorization']).toBe('Bearer session-jwt-token-xyz')
    expect(call.url).toBe('http://test.local/api/admin/rooms')
    expect(call.method).toBe('POST')
  })

  it('checkoutRoom sends Authorization from getAuthToken', async () => {
    mockGetAuthToken.mockReturnValue('session-jwt-token-chk')
    fetchMock.mockResolvedValue(
      postJson({ status: 'ok', message: 'Checked out' }, true),
    )
    await checkoutRoom(301)
    const call = lastFetchCall(fetchMock)
    expect(call.headers['Authorization']).toBe('Bearer session-jwt-token-chk')
    expect(call.url).toBe('http://test.local/api/session/checkout')
  })
})
