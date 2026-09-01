import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotFound } from './NotFound'

function renderNotFound(path = '/nonexistent') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NotFound />
    </MemoryRouter>,
  )
}

describe('NotFound', () => {
  it('renders the 404 heading', () => {
    renderNotFound()
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
  })

  it('renders the page not found kicker', () => {
    renderNotFound()
    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument()
  })

  it('shows a message indicating the page was not found', () => {
    renderNotFound()
    expect(screen.getByText(/could not find the page you requested/)).toBeInTheDocument()
  })

  it('provides a link back to the home page', () => {
    renderNotFound()
    expect(screen.getByRole('link', { name: 'Return to home' })).toHaveAttribute('href', '/')
  })
})
