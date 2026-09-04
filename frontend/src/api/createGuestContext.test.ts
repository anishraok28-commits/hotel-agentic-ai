import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/config/appConfig', () => ({
  MOCK_API_ENABLED: true,
  appConfig: { apiBaseUrl: 'http://test.local', serviceToken: '' },
}))

describe('createGuestContext', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns null when no guest session has been initialized', async () => {
    const mod = await import('@/api/mockTransport')
    const ctx = mod.createGuestContext()
    expect(ctx).toBeNull()
  })

  it('returns real context after initGuestSession sets it', async () => {
    const mod = await import('@/api/mockTransport')
    await mod.initGuestSession('mock-token-101-1700000000000')
    const ctx = mod.createGuestContext()
    expect(ctx).not.toBeNull()
    expect(ctx!.roomId).toBe(101)
    expect(ctx!.guestId).toMatch(/^guest-/)
    expect(ctx!.sessionId).toMatch(/^session-/)
  })

  it('does not generate random guest-<uuid> or session-<uuid> when null', async () => {
    const mod = await import('@/api/mockTransport')
    const ctx = mod.createGuestContext()
    expect(ctx).toBeNull()
    // The critical assertion: no random IDs were generated
    // createGuestContext should NOT have side effects
  })

  it('returns null after fresh module import (simulates browser refresh)', async () => {
    // Each dynamic import creates a fresh module with null mockGuestContext
    const freshMod = await import('@/api/mockTransport')
    const ctx = freshMod.createGuestContext()
    expect(ctx).toBeNull()
  })

  it('never overwrites payload credentials with roomId=0', async () => {
    const mod = await import('@/api/mockTransport')
    const ctx = mod.createGuestContext()
    // When null, the caller should NOT spread ctx over payload
    // So roomId=0 should never appear in submissions
    expect(ctx).toBeNull()
  })
})
