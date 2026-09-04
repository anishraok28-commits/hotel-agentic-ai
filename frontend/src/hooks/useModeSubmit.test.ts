import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  createGuestContext: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  createGuestContext: mocks.createGuestContext,
  submit: mocks.submit,
}))

vi.mock('@/api/apiContract', () => ({
  futureRouteFor: (mode: string) => {
    const routes: Record<string, string> = {
      AI_CONCIERGE: 'POST /api/concierge',
      QR_ROOM_SERVICE: 'POST /api/room-service',
      LATE_CHECKOUT: 'POST /api/late-checkout',
    }
    return routes[mode] ?? null
  },
}))

import { useModeSubmit } from './useModeSubmit'

describe('useModeSubmit — guest context handling', () => {
  beforeEach(() => {
    mocks.createGuestContext.mockReset()
    mocks.submit.mockReset()
    mocks.submit.mockResolvedValue({
      status: 'accepted',
      requestId: 'test-req',
      message: 'ok',
      data: {},
    })
  })

  it('preserves real payload credentials when createGuestContext returns null', async () => {
    mocks.createGuestContext.mockReturnValue(null)

    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const realPayload = {
      guestId: 'real-guest-id',
      sessionId: 'real-session-id',
      roomNumber: 305,
      items: [{ itemId: 'menu.001', name: 'Sandwich', quantity: 1, unitPrice: 1200 }],
      mode: 'QR_ROOM_SERVICE' as const,
    }

    await act(async () => {
      await result.current.run(realPayload)
    })

    expect(mocks.submit).toHaveBeenCalledTimes(1)
    const [, submittedPayload] = mocks.submit.mock.calls[0]
    expect(submittedPayload.guestId).toBe('real-guest-id')
    expect(submittedPayload.sessionId).toBe('real-session-id')
    expect(submittedPayload.roomNumber).toBe(305)
  })

  it('does not overwrite real guestId with mock values', async () => {
    mocks.createGuestContext.mockReturnValue(null)

    const { result } = renderHook(() => useModeSubmit('AI_CONCIERGE'))

    const payload = {
      guestId: 'server-generated-guest',
      sessionId: 'server-generated-session',
      roomNumber: 101,
      request: 'Test request',
      mode: 'AI_CONCIERGE' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted.guestId).toBe('server-generated-guest')
    expect(submitted.sessionId).toBe('server-generated-session')
  })

  it('does not overwrite real roomId with 0 from mock context', async () => {
    mocks.createGuestContext.mockReturnValue(null)

    const { result } = renderHook(() => useModeSubmit('LATE_CHECKOUT'))

    const payload = {
      guestId: 'real-guest',
      sessionId: 'real-session',
      roomNumber: 205,
      requestedTime: '2026-01-01T14:00:00Z',
      mode: 'LATE_CHECKOUT' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted.roomNumber).toBe(205)
  })

  it('merges guest context from createGuestContext when available', async () => {
    mocks.createGuestContext.mockReturnValue({
      roomId: 100,
      guestId: 'mock-guest',
      sessionId: 'mock-session',
    })

    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const payload = {
      guestId: 'original-guest',
      sessionId: 'original-session',
      roomNumber: 305,
      items: [],
      mode: 'QR_ROOM_SERVICE' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted.guestId).toBe('mock-guest')
    expect(submitted.sessionId).toBe('mock-session')
    expect(submitted.roomId).toBe(100)
  })

  it('generates no random credentials when mockGuestContext is null', async () => {
    mocks.createGuestContext.mockReturnValue(null)

    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const payload = {
      guestId: 'stable-id',
      sessionId: 'stable-session',
      roomNumber: 1,
      items: [],
      mode: 'QR_ROOM_SERVICE' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted.guestId).toBe('stable-id')
    expect(submitted.sessionId).toBe('stable-session')
    expect(submitted.guestId).not.toMatch(/^guest-/)
    expect(submitted.sessionId).not.toMatch(/^session-/)
  })

  it('preserves payload when createGuestContext returns null (no spread)', async () => {
    mocks.createGuestContext.mockReturnValue(null)

    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const payload = {
      guestId: 'g-real',
      sessionId: 's-real',
      roomNumber: 42,
      qrToken: 'qr-abc',
      items: [{ itemId: 'i1', name: 'Item', quantity: 2, unitPrice: 500 }],
      notes: 'Extra napkins',
      mode: 'QR_ROOM_SERVICE' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted).toEqual(payload)
  })
})
