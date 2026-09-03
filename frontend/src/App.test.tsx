import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useGuestContext } from '@/context/GuestContext'

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: false,
}))

import { GuestContextProvider } from './App'

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
