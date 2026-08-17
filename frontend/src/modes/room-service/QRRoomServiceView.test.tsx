import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

import { QRRoomServiceView } from './QRRoomServiceView'

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
      <QRRoomServiceView />
    </MemoryRouter>,
  )
}

/** The "Your order" review card. */
function orderCard() {
  const heading = screen.getByRole('heading', { name: 'Your order' })
  const card = heading.closest('.card')
  if (!card) throw new Error('Order card not found')
  return within(card as HTMLElement)
}

/** The subtotal line inside the order card. */
function subtotal(order: ReturnType<typeof orderCard>) {
  const row = order.getByText('Subtotal').closest('.cart-list__total-row')
  if (!row) throw new Error('Subtotal row not found')
  return within(row as HTMLElement)
}

describe('QRRoomServiceView', () => {
  beforeEach(() => {
    mocks.submit.mockReset()
    void mockSubmit()
  })

  it('renders the menu with categories and shows items', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'In-room dining' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Drinks/ })).toBeInTheDocument()
    expect(screen.getByText('Club Sandwich')).toBeInTheDocument()
    expect(screen.getByText('Sparkling Water')).toBeInTheDocument()
  })

  it('filters the menu by category', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Drinks/ }))

    expect(screen.queryByText('Club Sandwich')).not.toBeInTheDocument()
    expect(screen.getByText('Sparkling Water')).toBeInTheDocument()
  })

  it('shows an empty state when nothing is added', () => {
    renderView()
    expect(screen.getByText('Your order is empty')).toBeInTheDocument()
    expect(screen.getByText(/Add items from the menu/)).toBeInTheDocument()
  })

  it('adds an item to the cart, updates quantity and subtotal', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))

    const order = orderCard()
    expect(order.getByRole('spinbutton', { name: /Quantity of Club Sandwich/ })).toHaveValue(1)
    expect(subtotal(order).getByText('$12.00')).toBeInTheDocument()
  })

  it('increments the quantity with the cart stepper', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Margherita Pizza/ }))
    await user.click(screen.getByRole('button', { name: /Increase quantity of Margherita Pizza/ }))

    const order = orderCard()
    expect(order.getByRole('spinbutton', { name: /Quantity of Margherita Pizza/ })).toHaveValue(2)
    expect(subtotal(order).getByText('$28.00')).toBeInTheDocument()
  })

  it('submits the order to the room-service route', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Place order/ }))

    expect(await screen.findByRole('heading', { name: 'Order placed' })).toBeInTheDocument()

    const [route, payload] = mocks.submit.mock.calls[0] as [string, Record<string, unknown>]
    expect(route).toBe('POST /api/room-service')
    expect(payload).toMatchObject({
      mode: 'QR_ROOM_SERVICE',
      roomNumber: 305,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
    })
  })

  it('resets the cart when placing another order', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Place order/ }))

    await screen.findByRole('heading', { name: 'Order placed' })
    await user.click(screen.getByRole('button', { name: /Place another order/ }))

    expect(screen.getByText('Your order is empty')).toBeInTheDocument()
  })
})