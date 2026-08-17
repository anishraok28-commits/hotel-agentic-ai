import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  failToggle: { value: false },
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: true,
  createGuestContext: () => ({ guestId: 'stub-guest', sessionId: 'stub-session' }),
  submit: mocks.submit,
}))

import { AIConciergeView } from './AIConciergeView'

async function mockSubmit() {
  mocks.submit.mockImplementation(async () => {
    if (mocks.failToggle.value) {
      return {
        status: 'error',
        requestId: 'stub-error',
        message: 'The automation layer is unavailable.',
        code: 'AUTOMATION_FAILED',
      }
    }
    return {
      status: 'accepted',
      requestId: 'stub-accepted',
      message: 'Request mock-accepted.',
      data: { submittedAt: '2026-08-11T00:00:00.000Z' },
    }
  })
}

function renderView() {
  return render(
    <MemoryRouter>
      <AIConciergeView />
    </MemoryRouter>,
  )
}

describe('AIConciergeView', () => {
  beforeEach(() => {
    mocks.failToggle.value = false
    mocks.submit.mockReset()
    void mockSubmit()
  })

  it('renders the welcome message and categories', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Your concierge' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Dining & reservations/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Local recommendations/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Events & tickets/ })).toBeInTheDocument()
  })

  it('prefills the request when a category is chosen', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Dining & reservations/ }))

    const textarea = screen.getByRole('textbox', { name: /Your request/ })
    expect(((textarea as HTMLTextAreaElement).value.match(/recommend restaurant/i))).not.toBeNull()
    expect(screen.getByRole('button', { name: /Dining & reservations/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('submits a concierge request and shows the success state', async () => {
    const user = userEvent.setup()
    renderView()

    await user.type(screen.getByRole('textbox', { name: /Your request/ }), 'Book a spa session')
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '214')

    await user.click(screen.getByRole('button', { name: /Send to concierge/ }))

    expect(
      await screen.findByRole('heading', { name: 'Request received' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/stub-accepted/)).toBeInTheDocument()

    const [route, payload] = mocks.submit.mock.calls[0] as [string, Record<string, unknown>]
    expect(route).toBe('POST /api/concierge')
    expect(payload).toMatchObject({
      mode: 'AI_CONCIERGE',
      roomNumber: 214,
      request: 'Book a spa session',
      guestId: 'stub-guest',
      sessionId: 'stub-session',
    })
  })

  it('resets to the form when starting another request', async () => {
    const user = userEvent.setup()
    renderView()

    await user.type(screen.getByRole('textbox', { name: /Your request/ }), 'Anything')
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '100')
    await user.click(screen.getByRole('button', { name: /Send to concierge/ }))

    await screen.findByRole('heading', { name: 'Request received' })
    await user.click(screen.getByRole('button', { name: /Start another request/ }))

    expect(screen.getByRole('button', { name: /Send to concierge/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /Your request/ })).toHaveValue('')
  })

  it('shows an error state and allows retry when the submission fails', async () => {
    const user = userEvent.setup()
    mocks.failToggle.value = true
    void mockSubmit()
    renderView()

    await user.type(screen.getByRole('textbox', { name: /Your request/ }), 'Anything')
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '101')
    await user.click(screen.getByRole('button', { name: /Send to concierge/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/automation layer is unavailable/i)).toBeInTheDocument()

    mocks.failToggle.value = false
    void mockSubmit()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(screen.getByRole('button', { name: /Send to concierge/ })).toBeInTheDocument()
  })
})