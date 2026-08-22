import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submit } from '@/api/mockTransport'

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
