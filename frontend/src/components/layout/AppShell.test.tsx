import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ModeNav } from '@/components/layout/ModeNav'

describe('ModeNav', () => {
  it('renders links to all four modes', () => {
    render(
      <MemoryRouter>
        <ModeNav />
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
})

describe('AppShell', () => {
  it('renders children inside the shell', () => {
    render(
      <MemoryRouter>
        <AppShell>
          <p>shell content</p>
        </AppShell>
      </MemoryRouter>,
    )
    expect(screen.getByText('shell content')).toBeInTheDocument()
  })
})