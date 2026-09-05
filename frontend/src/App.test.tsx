import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useGuestContext } from '@/context/GuestContext'

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

  it('does not overwrite existing qrToken with a different stored value', () => {
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

    // Should NOT overwrite the existing qrToken
    expect(screen.getByTestId('qrToken')).toHaveTextContent('first-token')
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
