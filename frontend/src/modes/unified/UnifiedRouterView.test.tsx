import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { UnifiedRouterView } from './UnifiedRouterView'
import { NotFound } from '@/components/state/NotFound'

function renderUnified(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<UnifiedRouterView />} />
        <Route path="/concierge" element={<p>AI Concierge View Rendered</p>} />
        <Route path="/room-service" element={<p>QR Room Service View Rendered</p>} />
        <Route path="/late-checkout" element={<p>Late Checkout View Rendered</p>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('3_IN_1_UNIFIED routing layer', () => {
  it('shows all three destination modes', () => {
    renderUnified()
    expect(screen.getByRole('link', { name: /AI Concierge/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /QR Room Service/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Late Checkout/ })).toBeInTheDocument()
  })

  it('does not present itself as a service route (no fourth mode destination card)', () => {
    renderUnified()
    expect(screen.queryByRole('link', { name: /Guest Services/ })).not.toBeInTheDocument()
  })

  it('routes to the AI Concierge flow', async () => {
    renderUnified()
    const link = screen.getByRole('link', { name: /AI Concierge/ })
    link.click()
    expect(await screen.findByText('AI Concierge View Rendered')).toBeInTheDocument()
  })

  it('routes to the QR Room Service flow', async () => {
    renderUnified()
    const link = screen.getByRole('link', { name: /QR Room Service/ })
    link.click()
    expect(await screen.findByText('QR Room Service View Rendered')).toBeInTheDocument()
  })

  it('routes to the Late Checkout flow', async () => {
    renderUnified()
    const link = screen.getByRole('link', { name: /Late Checkout/ })
    link.click()
    expect(await screen.findByText('Late Checkout View Rendered')).toBeInTheDocument()
  })

  it('renders NotFound for unmatched routes', () => {
    renderUnified('/unknown-path')
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
    expect(screen.getByText(/could not find the page you requested/)).toBeInTheDocument()
  })
})