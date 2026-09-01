import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: true,
  createGuestContext: () => ({ guestId: 'stub-guest', sessionId: 'stub-session' }),
  submit: mocks.submit,
}))

import { LateCheckoutView } from './LateCheckoutView'

async function mockSubmit() {
  mocks.submit.mockImplementation(async () => ({
    status: 'accepted',
    requestId: 'stub-accepted',
    message: 'Request mock-accepted.',
    data: { submittedAt: '2026-08-11T00:00:00.000Z' },
  }))
}

function renderView() {
  return render(
    <MemoryRouter>
      <LateCheckoutView />
    </MemoryRouter>,
  )
}

describe('LateCheckoutView', () => {
  beforeEach(() => {
    mocks.submit.mockReset()
    void mockSubmit()
  })

  it('renders the checkout options and review summary', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Extend your checkout' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Lazy morning/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Full afternoon/ })).toBeInTheDocument()
    expect(screen.getByText('11:00 AM')).toBeInTheDocument()
  })

  it('selects a different time option and updates the review', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('radio', { name: /Full afternoon/ }))

    expect(screen.getByRole('radio', { name: /Full afternoon/ })).toBeChecked()
    expect(screen.getAllByText('Until 3:00 PM').length).toBeGreaterThan(1)
  })

  it('submits a late checkout request with the selected time', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('radio', { name: /Relaxed departure/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '214')
    await user.click(screen.getByRole('button', { name: /Request late checkout/ }))

    expect(await screen.findByRole('heading', { name: 'Late checkout requested' })).toBeInTheDocument()
    expect(screen.getByText(/Until 1:00 PM/)).toBeInTheDocument()

    const [route, payload] = mocks.submit.mock.calls[0] as [string, Record<string, unknown>]
    expect(route).toBe('POST /api/late-checkout')
    expect(payload).toMatchObject({
      mode: 'LATE_CHECKOUT',
      roomNumber: 214,
      requestedTime: expect.any(String),
    })
    const requested = new Date(payload.requestedTime as string)
    expect(requested.getTime()).toBeGreaterThan(Date.now())
    expect(payload.requestedTime).toMatch(/Z$/)
  })

  it('shows an error state when the submission fails', async () => {
    const user = userEvent.setup()
    mocks.submit.mockImplementation(async () => ({
      status: 'error',
      requestId: 'stub-error',
      message: 'The automation layer is unavailable.',
      code: 'AUTOMATION_FAILED',
    }))
    renderView()

    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '214')
    await user.click(screen.getByRole('button', { name: /Request late checkout/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/automation layer is unavailable/i)).toBeInTheDocument()
  })

  it('does not submit twice while a request is in flight', async () => {
    let resolveSubmit: (value: unknown) => void = () => undefined
    mocks.submit.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmit = resolve
        }),
    )
    const user = userEvent.setup()
    renderView()

    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '214')
    const button = screen.getByRole('button', { name: /Request late checkout/ })
    await user.click(button)
    await user.click(button)

    expect(mocks.submit).toHaveBeenCalledTimes(1)

    resolveSubmit({
      status: 'accepted',
      requestId: 'stub-accepted',
      message: 'Request mock-accepted.',
      data: { submittedAt: '2026-08-11T00:00:00.000Z' },
    })
    await screen.findByRole('heading', { name: 'Late checkout requested' })
  })

  it('preserves radio selection after error and retry', async () => {
    const user = userEvent.setup()
    mocks.submit.mockImplementation(async () => ({
      status: 'error',
      requestId: 'stub-error',
      message: 'The automation layer is unavailable.',
      code: 'AUTOMATION_FAILED',
    }))
    renderView()

    await user.click(screen.getByRole('radio', { name: /Full afternoon/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '101')
    await user.click(screen.getByRole('button', { name: /Request late checkout/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    mocks.submit.mockImplementation(async () => ({
      status: 'accepted',
      requestId: 'stub-accepted',
      message: 'Request mock-accepted.',
      data: { submittedAt: '2026-08-11T00:00:00.000Z' },
    }))
    await user.click(screen.getByRole('button', { name: /Try again/ }))

    // After retry, the form is shown again with preserved state
    expect(screen.getByRole('radio', { name: /Full afternoon/ })).toBeChecked()
    expect(screen.getByRole('spinbutton', { name: /Room number/ })).toHaveValue(101)
  })

  it('preserves room number after error and retry', async () => {
    const user = userEvent.setup()
    mocks.submit.mockImplementation(async () => ({
      status: 'error',
      requestId: 'stub-error',
      message: 'Network failure.',
      code: 'NETWORK_ERROR',
    }))
    renderView()

    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Request late checkout/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    mocks.submit.mockImplementation(async () => ({
      status: 'accepted',
      requestId: 'stub-accepted',
      message: 'Request mock-accepted.',
      data: { submittedAt: '2026-08-11T00:00:00.000Z' },
    }))
    await user.click(screen.getByRole('button', { name: /Try again/ }))

    expect(screen.getByRole('spinbutton', { name: /Room number/ })).toHaveValue(305)
  })

  it('does not render prototype text in the footer', () => {
    renderView()
    expect(screen.queryByText(/prototype/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/not connected/i)).not.toBeInTheDocument()
  })
})