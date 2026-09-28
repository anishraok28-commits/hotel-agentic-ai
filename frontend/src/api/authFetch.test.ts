import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authFetch } from './authFetch'

// Mock the config
vi.mock('@/config/appConfig', () => ({
  MOCK_API_ENABLED: false,
  appConfig: { apiBaseUrl: 'http://test', env: 'local' },
}))

const AUTH_TOKEN_KEY = 'staff-auth-token'
const AUTH_USER_KEY = 'staff-auth-user'

function setSessionStorage(token: string, user = '{"id":"1"}') {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token)
  sessionStorage.setItem(AUTH_USER_KEY, user)
}

function clearSessionStorage() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY)
  sessionStorage.removeItem(AUTH_USER_KEY)
}

describe('authFetch', () => {
  const originalFetch = global.fetch
  const originalLocation = window.location

  beforeEach(() => {
    clearSessionStorage()
    setSessionStorage('test-token')
    // mock window.location.replace
    ;(window as any).location = { replace: vi.fn(), origin: 'http://localhost' }
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    ;(window as any).location = originalLocation
    clearSessionStorage()
  })

  it('attaches Bearer token from sessionStorage', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'ok' }),
    })

    await authFetch('http://test/api/admin/orders', { method: 'GET' })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test/api/admin/orders',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('clears storage and redirects on 401', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    })

    await authFetch('http://test/api/admin/orders', { method: 'GET' })

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull()
    expect(sessionStorage.getItem(AUTH_USER_KEY)).toBeNull()
    expect(window.location.replace).toHaveBeenCalledWith('http://localhost/login?sessionExpired=1')
  })

  it('does NOT clear storage on 403', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    })

    await authFetch('http://test/api/admin/orders', { method: 'GET' })

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe('test-token')
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('does NOT clear storage on 200', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'ok' }),
    })

    await authFetch('http://test/api/admin/orders', { method: 'GET' })

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe('test-token')
    expect(window.location.replace).not.toHaveBeenCalled()
  })

  it('does NOT clear storage on 202', async () => {
    ;(global.fetch as any).mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ data: 'accepted' }),
    })

    await authFetch('http://test/api/admin/orders', { method: 'POST', body: JSON.stringify({}) })

    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBe('test-token')
    expect(window.location.replace).not.toHaveBeenCalled()
  })
})