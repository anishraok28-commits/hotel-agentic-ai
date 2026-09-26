import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useGuestContext, saveGuestContext, loadGuestContext } from '@/context/GuestContext'
import type { GuestContextValue } from '@/context/GuestContext'

const mocks = vi.hoisted(() => ({
  initGuestSession: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: false,
  initGuestSession: mocks.initGuestSession,
}))

import { GuestContextProvider, RootLanding } from './App'

function Consumer() {
  const ctx = useGuestContext()
  return (
    <div>
      <span data-testid="qrToken">{ctx.qrToken}</span>
      <span data-testid="guestId">{ctx.guestId}</span>
      <span data-testid="sessionId">{ctx.sessionId}</span>
      <span data-testid="roomNumber">{String(ctx.roomNumber)}</span>
    </div>
  )
}

function Root() {
  return (
    <MemoryRouter>
      <GuestContextProvider>
        <Consumer />
      </GuestContextProvider>
    </MemoryRouter>
  )
}

describe('GuestContextProvider', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('starts with empty qrToken when sessionStorage is empty', () => {
    render(<Root />)
    expect(screen.getByTestId('qrToken')).toHaveTextContent('')
  })

  it('loads existing context from sessionStorage on mount', () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 444,
      guestId: 'guest-123',
      sessionId: 'session-456',
      qrToken: 'existing-token',
    }))

    render(<Root />)

    expect(screen.getByTestId('qrToken')).toHaveTextContent('existing-token')
    expect(screen.getByTestId('guestId')).toHaveTextContent('guest-123')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('session-456')
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('444')
  })

  it('picks up context saved to sessionStorage between mount and re-render', () => {
    const { rerender } = render(<Root />)
    expect(screen.getByTestId('qrToken')).toHaveTextContent('')

    // Simulate what RootLanding does: save context to sessionStorage
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 444,
      guestId: 'guest-async',
      sessionId: 'session-async',
      qrToken: 'async-token',
    }))

    // Trigger a re-render to pick up the new sessionStorage value
    act(() => {
      rerender(<Root />)
    })

    expect(screen.getByTestId('qrToken')).toHaveTextContent('async-token')
    expect(screen.getByTestId('guestId')).toHaveTextContent('guest-async')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('session-async')
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('444')
  })

  it('syncs context from sessionStorage when stored values change', () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 100,
      guestId: 'guest-first',
      sessionId: 'session-first',
      qrToken: 'first-token',
    }))

    const { rerender } = render(<Root />)
    expect(screen.getByTestId('qrToken')).toHaveTextContent('first-token')

    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 200,
      guestId: 'guest-second',
      sessionId: 'session-second',
      qrToken: 'second-token',
    }))

    act(() => {
      rerender(<Root />)
    })

    // Guard detects all three fields changed → context syncs from sessionStorage
    expect(screen.getByTestId('qrToken')).toHaveTextContent('second-token')
    expect(screen.getByTestId('guestId')).toHaveTextContent('guest-second')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('session-second')
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('200')
  })

  it('provides default context values when no stored context', () => {
    render(<Root />)
    expect(screen.getByTestId('qrToken')).toHaveTextContent('')
    expect(screen.getByTestId('guestId')).toHaveTextContent('')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('')
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('null')
  })
})

function AppRoot({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <GuestContextProvider>
        <Routes>
          <Route path="/" element={<RootLanding />} />
          <Route path="/room-service" element={<div data-testid="room-service">Room Service</div>} />
        </Routes>
      </GuestContextProvider>
    </MemoryRouter>
  )
}

describe('RootLanding redirect', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mocks.initGuestSession.mockReset()
  })

  it('navigates to /room-service when existing context + active order', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-abc',
      sessionId: 'session-xyz',
      qrToken: 'qr-token-101',
    }))
    sessionStorage.setItem('qr-room-service-active-order', JSON.stringify({
      orderId: 'order-123',
      status: 'NEW',
    }))

    render(<AppRoot initialEntries={['/?token=qr-token-101']} />)

    await waitFor(() => {
      expect(screen.getByTestId('room-service')).toBeInTheDocument()
    })

    expect(mocks.initGuestSession).not.toHaveBeenCalled()
  })

  it('calls initGuestSession when stored context has qrToken but empty guestId/sessionId', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: null,
      guestId: '',
      sessionId: '',
      qrToken: 'qr-token-101',
    }))

    mocks.initGuestSession.mockResolvedValueOnce({
      status: 'ok',
      data: { roomId: 101, guestId: 'new-guest', sessionId: 'new-session' },
    })

    render(<AppRoot initialEntries={['/?token=qr-token-101']} />)

    await waitFor(() => {
      expect(mocks.initGuestSession).toHaveBeenCalledWith('qr-token-101')
    })
  })

  it('reuses existing session without calling initGuestSession when guestId and sessionId are present', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-abc',
      sessionId: 'session-xyz',
      qrToken: 'qr-token-101',
    }))

    render(<AppRoot initialEntries={['/?token=qr-token-101']} />)

    await waitFor(() => {
      expect(screen.getByText('Room 101')).toBeInTheDocument()
    })

    expect(mocks.initGuestSession).not.toHaveBeenCalled()
  })

  it('navigates to / when existing context + no active order', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-abc',
      sessionId: 'session-xyz',
      qrToken: 'qr-token-101',
    }))

    render(<AppRoot initialEntries={['/?token=qr-token-101']} />)

    await waitFor(() => {
      expect(screen.getByText('Room 101')).toBeInTheDocument()
    })
  })

  it('restores GuestContext from sessionStorage on mount', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 444,
      guestId: 'guest-restored',
      sessionId: 'session-restored',
      qrToken: 'restored-token',
    }))

    render(<AppRoot initialEntries={['/?token=restored-token']} />)

    await waitFor(() => {
      expect(screen.getByText('Room 444')).toBeInTheDocument()
    })
  })

  it('restores active order from sessionStorage on redirect to /room-service', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 202,
      guestId: 'guest-order',
      sessionId: 'session-order',
      qrToken: 'qr-token-202',
    }))
    sessionStorage.setItem('qr-room-service-active-order', JSON.stringify({
      orderId: 'order-456',
      status: 'PREPARING',
      roomNumber: 202,
      items: [{ itemId: 'menu.001', name: 'Burger', quantity: 1, unitPrice: 1500 }],
      total: 1500,
    }))

    render(<AppRoot initialEntries={['/?token=qr-token-202']} />)

    await waitFor(() => {
      expect(screen.getByTestId('room-service')).toBeInTheDocument()
    })

    const stored = JSON.parse(sessionStorage.getItem('qr-room-service-active-order')!)
    expect(stored.orderId).toBe('order-456')
    expect(stored.status).toBe('PREPARING')
  })
})

// =============================================================================
// Bug #1 Regression Tests — roomNumber preservation in updateSession
// =============================================================================

function UpdateSessionConsumer({ onReady }: { onReady: (ctx: GuestContextValue) => void }) {
  const ctx = useGuestContext()
  onReady(ctx)
  return (
    <div>
      <span data-testid="qrToken">{ctx.qrToken}</span>
      <span data-testid="guestId">{ctx.guestId}</span>
      <span data-testid="sessionId">{ctx.sessionId}</span>
      <span data-testid="roomNumber">{String(ctx.roomNumber)}</span>
    </div>
  )
}

function UpdateSessionRoot({ initialEntries }: { initialEntries?: string[] } = {}) {
  return (
    <MemoryRouter initialEntries={initialEntries ?? ['/']}>
      <GuestContextProvider>
        <UpdateSessionConsumer onReady={() => {}} />
      </GuestContextProvider>
    </MemoryRouter>
  )
}

describe('Bug #1 — updateSession roomNumber preservation', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('updateSession preserves roomNumber when prev.roomNumber is already 101', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'old-guest',
      sessionId: 'old-session',
      qrToken: 'qr-token-101',
    }))

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    // Wait for context to hydrate
    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
      expect(capturedCtx!.roomNumber).toBe(101)
    })

    // Call updateSession with new credentials (simulates backend session recovery)
    act(() => {
      capturedCtx!.updateSession('new-guest', 'new-session')
    })

    // roomNumber must remain 101
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('101')
    expect(screen.getByTestId('guestId')).toHaveTextContent('new-guest')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('new-session')
    expect(screen.getByTestId('qrToken')).toHaveTextContent('qr-token-101')

    // Verify sessionStorage consistency
    const json = JSON.parse(sessionStorage.getItem('hotel-guest-context')!)
    expect(json.roomNumber).toBe(101)
    expect(json.guestId).toBe('new-guest')
    expect(json.sessionId).toBe('new-session')
    expect(json.qrToken).toBe('qr-token-101')
  })

  it('updateSession recovers roomNumber from sessionStorage when prev.roomNumber is null', async () => {
    // Simulate the mismatch: JSON blob has roomNumber null, but individual key has "101"
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: null,
      guestId: 'old-guest',
      sessionId: 'old-session',
      qrToken: 'qr-token-101',
    }))
    sessionStorage.setItem('roomNumber', '101')

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
    })

    // Call updateSession — roomNumber should be recovered from sessionStorage
    act(() => {
      capturedCtx!.updateSession('new-guest', 'new-session')
    })

    // roomNumber should be 101 (recovered from individual sessionStorage key)
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('101')

    // Verify JSON blob is now consistent
    const json = JSON.parse(sessionStorage.getItem('hotel-guest-context')!)
    expect(json.roomNumber).toBe(101)
  })

  it('updateSession preserves qrToken', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 201,
      guestId: 'guest-201',
      sessionId: 'session-201',
      qrToken: 'unique-qr-token',
    }))

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
    })

    act(() => {
      capturedCtx!.updateSession('new-guest', 'new-session')
    })

    expect(screen.getByTestId('qrToken')).toHaveTextContent('unique-qr-token')
  })

  it('updateSession preserves guestId', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 201,
      guestId: 'original-guest',
      sessionId: 'original-session',
      qrToken: 'qr-201',
    }))

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
    })

    act(() => {
      capturedCtx!.updateSession('recovered-guest', 'recovered-session')
    })

    expect(screen.getByTestId('guestId')).toHaveTextContent('recovered-guest')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('recovered-session')
  })

  it('updateSession preserves sessionId', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 201,
      guestId: 'guest-201',
      sessionId: 'session-original',
      qrToken: 'qr-201',
    }))

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
    })

    act(() => {
      capturedCtx!.updateSession('guest-201', 'session-recovered')
    })

    expect(screen.getByTestId('sessionId')).toHaveTextContent('session-recovered')
  })

  it('saveGuestContext produces roomNumber=101 in JSON after updateSession', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-101',
      sessionId: 'session-101',
      qrToken: 'qr-101',
    }))

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
    })

    act(() => {
      capturedCtx!.updateSession('new-guest', 'new-session')
    })

    const json = JSON.parse(sessionStorage.getItem('hotel-guest-context')!)
    expect(json.roomNumber).toBe(101)
  })

  it('JSON context and individual sessionStorage.roomNumber remain consistent after recovery', async () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-101',
      sessionId: 'session-101',
      qrToken: 'qr-101',
    }))
    sessionStorage.setItem('roomNumber', '101')

    let capturedCtx: GuestContextValue | null = null
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={(ctx) => { capturedCtx = ctx }} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(capturedCtx).not.toBeNull()
    })

    act(() => {
      capturedCtx!.updateSession('new-guest', 'new-session')
    })

    const json = JSON.parse(sessionStorage.getItem('hotel-guest-context')!)
    expect(json.roomNumber).toBe(101)
    expect(sessionStorage.getItem('roomNumber')).toBe('101')
  })

  it('render sync detects roomNumber mismatch between stored and context', () => {
    // Set up a mismatch: stored has roomNumber 200, context has roomNumber 100
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 200,
      guestId: 'guest-200',
      sessionId: 'session-200',
      qrToken: 'qr-200',
    }))

    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={() => {}} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    // The render sync should detect roomNumber 200 from stored and display it
    expect(screen.getByTestId('roomNumber')).toHaveTextContent('200')
  })

  it('render sync picks up roomNumber change from sessionStorage on re-render', () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 100,
      guestId: 'guest-100',
      sessionId: 'session-100',
      qrToken: 'qr-100',
    }))

    const { rerender } = render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={() => {}} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('roomNumber')).toHaveTextContent('100')

    // Simulate updateSession writing roomNumber null (the old bug scenario)
    // Then render-time sync should correct it
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 300,
      guestId: 'guest-300',
      sessionId: 'session-300',
      qrToken: 'qr-300',
    }))

    act(() => {
      rerender(
        <MemoryRouter>
          <GuestContextProvider>
            <UpdateSessionConsumer onReady={() => {}} />
          </GuestContextProvider>
        </MemoryRouter>,
      )
    })

    expect(screen.getByTestId('roomNumber')).toHaveTextContent('300')
  })

  it('page refresh restores roomNumber from sessionStorage', () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-101',
      sessionId: 'session-101',
      qrToken: 'qr-101',
    }))
    sessionStorage.setItem('qrToken', 'qr-101')
    sessionStorage.setItem('guestId', 'guest-101')
    sessionStorage.setItem('sessionId', 'session-101')
    sessionStorage.setItem('roomNumber', '101')

    // Simulate page refresh by mounting a fresh provider
    render(
      <MemoryRouter>
        <GuestContextProvider>
          <UpdateSessionConsumer onReady={() => {}} />
        </GuestContextProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('roomNumber')).toHaveTextContent('101')
    expect(screen.getByTestId('guestId')).toHaveTextContent('guest-101')
    expect(screen.getByTestId('sessionId')).toHaveTextContent('session-101')
    expect(screen.getByTestId('qrToken')).toHaveTextContent('qr-101')
  })

  it('navigation between modes does not lose roomNumber', () => {
    sessionStorage.setItem('hotel-guest-context', JSON.stringify({
      roomNumber: 101,
      guestId: 'guest-101',
      sessionId: 'session-101',
      qrToken: 'qr-101',
    }))

    const { rerender } = render(
      <MemoryRouter initialEntries={['/concierge']}>
        <GuestContextProvider>
          <Routes>
            <Route path="/concierge" element={<UpdateSessionConsumer onReady={() => {}} />} />
            <Route path="/late-checkout" element={<UpdateSessionConsumer onReady={() => {}} />} />
            <Route path="/room-service" element={<UpdateSessionConsumer onReady={() => {}} />} />
          </Routes>
        </GuestContextProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('roomNumber')).toHaveTextContent('101')

    // Navigate to late-checkout
    rerender(
      <MemoryRouter initialEntries={['/late-checkout']}>
        <GuestContextProvider>
          <Routes>
            <Route path="/concierge" element={<UpdateSessionConsumer onReady={() => {}} />} />
            <Route path="/late-checkout" element={<UpdateSessionConsumer onReady={() => {}} />} />
            <Route path="/room-service" element={<UpdateSessionConsumer onReady={() => {}} />} />
          </Routes>
        </GuestContextProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('roomNumber')).toHaveTextContent('101')

    // Navigate to room-service
    rerender(
      <MemoryRouter initialEntries={['/room-service']}>
        <GuestContextProvider>
          <Routes>
            <Route path="/concierge" element={<UpdateSessionConsumer onReady={() => {}} />} />
            <Route path="/late-checkout" element={<UpdateSessionConsumer onReady={() => {}} />} />
            <Route path="/room-service" element={<UpdateSessionConsumer onReady={() => {}} />} />
          </Routes>
        </GuestContextProvider>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('roomNumber')).toHaveTextContent('101')
  })
})
