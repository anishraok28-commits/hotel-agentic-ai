import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import { ModeNav } from '@/components/layout/ModeNav'

describe('ModeNav', () => {
  it('renders links to all four modes when not authenticated', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ModeNav />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /AI Concierge/ })).toHaveAttribute('href', '/concierge')
    expect(screen.getByRole('link', { name: /QR Room Service/ })).toHaveAttribute(
      'href',
      '/room-service',
    )
    expect(screen.getByRole('link', { name: /Late Checkout/ })).toHaveAttribute(
      'href',
      '/late-checkout',
    )
    expect(screen.getByRole('link', { name: /Guest Services/ })).toHaveAttribute('href', '/')
  })

  it('renders nothing when staff is authenticated', () => {
    sessionStorage.setItem('staff-auth-token', 'test-token')
    sessionStorage.setItem('staff-auth-user', JSON.stringify({
      id: 'staff-frontdesk',
      name: 'Frontdesk Staff',
      identifier: 'frontdesk',
      role: 'FRONT_DESK',
    }))
    render(
      <MemoryRouter>
        <AuthProvider>
          <ModeNav />
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /AI Concierge/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /QR Room Service/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Late Checkout/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Guest Services/ })).not.toBeInTheDocument()
    sessionStorage.clear()
  })
})

describe('AppShell', () => {
  it('renders children inside the shell', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppShell>
            <p>shell content</p>
          </AppShell>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText('shell content')).toBeInTheDocument()
  })
})