import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
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

describe('useModeSubmit — payload passthrough', () => {
  beforeEach(() => {
    mocks.submit.mockReset()
    mocks.submit.mockResolvedValue({
      status: 'accepted',
      requestId: 'test-req',
      message: 'ok',
      data: {},
    })
  })

  it('passes payload directly to submit without modification', async () => {
    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const payload = {
      guestId: 'real-guest-id',
      sessionId: 'real-session-id',
      roomNumber: 305,
      items: [{ itemId: 'menu.001', name: 'Sandwich', quantity: 1, unitPrice: 1200 }],
      qrToken: 'qr-abc',
      mode: 'QR_ROOM_SERVICE' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    expect(mocks.submit).toHaveBeenCalledTimes(1)
    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted).toEqual(payload)
  })

  it('does not overwrite real guestId', async () => {
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

  it('does not overwrite real roomId', async () => {
    const { result } = renderHook(() => useModeSubmit('LATE_CHECKOUT'))

    const payload = {
      guestId: 'real-guest',
      sessionId: 'real-session',
      roomNumber: 205,
      requestedTime: '2026-01-01T14:00:00Z',
      qrToken: 'qr-test',
      mode: 'LATE_CHECKOUT' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    const [, submitted] = mocks.submit.mock.calls[0]
    expect(submitted.roomNumber).toBe(205)
  })

  it('preserves qrToken in submitted payload', async () => {
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

  it('returns error when mode has no API route', async () => {
    const { result } = renderHook(() => useModeSubmit('3_IN_1_UNIFIED'))

    const payload = {
      guestId: 'g1',
      sessionId: 's1',
      roomNumber: 1,
      request: 'test',
      mode: 'AI_CONCIERGE' as const,
    }

    await act(async () => {
      await result.current.run(payload as never)
    })

    expect(result.current.result.phase).toBe('error')
    if (result.current.result.phase === 'error') {
      expect(result.current.result.error.message).toContain('no API route')
    }
  })

  it('returns error on submission failure', async () => {
    mocks.submit.mockResolvedValue({
      status: 'error',
      requestId: 'err-1',
      message: 'Backend unavailable',
      code: 'AUTOMATION_FAILED',
    })

    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const payload = {
      guestId: 'g1',
      sessionId: 's1',
      roomNumber: 1,
      items: [],
      qrToken: 'qr-1',
      mode: 'QR_ROOM_SERVICE' as const,
    }

    await act(async () => {
      await result.current.run(payload)
    })

    expect(result.current.result.phase).toBe('error')
    if (result.current.result.phase === 'error') {
      expect(result.current.result.error.code).toBe('AUTOMATION_FAILED')
    }
  })

  it('prevents concurrent submissions', async () => {
    let resolveFirst: (value: unknown) => void
    mocks.submit.mockImplementation(() => new Promise((r) => { resolveFirst = r }))

    const { result } = renderHook(() => useModeSubmit('QR_ROOM_SERVICE'))

    const payload = {
      guestId: 'g1',
      sessionId: 's1',
      roomNumber: 1,
      items: [],
      qrToken: 'qr-1',
      mode: 'QR_ROOM_SERVICE' as const,
    }

    act(() => { void result.current.run(payload) })
    act(() => { void result.current.run(payload) })

    expect(mocks.submit).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst!({
        status: 'accepted',
        requestId: 'ok-1',
        message: 'ok',
        data: {},
      })
    })
  })
})
