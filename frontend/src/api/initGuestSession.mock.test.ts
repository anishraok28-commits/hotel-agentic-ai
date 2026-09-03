import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/appConfig', () => ({
  MOCK_API_ENABLED: true,
  appConfig: { apiBaseUrl: 'http://test.local', environment: 'test' },
}))

import { initGuestSession } from '@/api/mockTransport'

describe('initGuestSession (mock mode)', () => {
  it('extracts room number from mock token format', async () => {
    const token = 'mock-token-101-1700000000000'
    const result = await initGuestSession(token)
    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(result.data.roomId).toBe(101)
      expect(result.data.guestId).toMatch(/^guest-/)
      expect(result.data.sessionId).toMatch(/^session-/)
    }
  })

  it('extracts room number 305 from mock token', async () => {
    const token = 'mock-token-305-1700000000000'
    const result = await initGuestSession(token)
    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(result.data.roomId).toBe(305)
    }
  })

  it('returns roomId 0 for malformed token', async () => {
    const token = 'some-random-token'
    const result = await initGuestSession(token)
    expect(result.status).toBe('accepted')
    if (result.status === 'accepted') {
      expect(result.data.roomId).toBe(0)
    }
  })
})
