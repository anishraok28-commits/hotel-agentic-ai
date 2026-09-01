import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  checkOrderStatus: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: true,
  createGuestContext: () => ({ guestId: 'stub-guest', sessionId: 'stub-session' }),
  submit: mocks.submit,
  checkOrderStatus: mocks.checkOrderStatus,
}))

import { QRRoomServiceView } from './QRRoomServiceView'

function renderView() {
  return render(
    <MemoryRouter>
      <QRRoomServiceView />
    </MemoryRouter>,
  )
}

function orderPanel() {
  const heading = screen.getByRole('heading', { name: 'Your order' })
  return within(heading.closest('.card') as HTMLElement)
}

function orderSubtotal() {
  const row = orderPanel().getByText('Subtotal').closest('.cart-list__total-row')!
  return within(row as HTMLElement)
}

describe('QRRoomServiceView', () => {
  beforeEach(() => {
    mocks.submit.mockReset()
    mocks.checkOrderStatus.mockReset()
    mocks.submit.mockImplementation(async () => ({
      status: 'accepted',
      requestId: 'stub-accepted',
      message: 'Order accepted',
      data: {
        orderId: 'test-order-123',
        status: 'NEW',
        roomNumber: 305,
        items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
        total: 1200,
        createdAt: new Date().toISOString(),
      },
    }))
    mocks.checkOrderStatus.mockImplementation(async () => ({
      status: 'accepted',
      requestId: 'stub-status',
      message: 'Order found',
      data: {
        orderId: 'test-order-123',
        status: 'PREPARING',
        roomNumber: 305,
        items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
        total: 1200,
        createdAt: new Date().toISOString(),
      },
    }))
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

    expect(screen.queryByText('Triple layer, grilled chicken, bacon, egg and house aioli.')).not.toBeInTheDocument()
    expect(screen.getByText('Sparkling Water')).toBeInTheDocument()
  })

  it('shows an empty state when nothing is added', () => {
    renderView()
    expect(screen.getByText('Your order is empty')).toBeInTheDocument()
    expect(screen.getByText(/Add items from the menu/)).toBeInTheDocument()
  })

  it('adds an item to the cart and shows it in the order panel', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))

    const panel = orderPanel()
    expect(panel.getByText('Club Sandwich')).toBeInTheDocument()
    expect(orderSubtotal().getByText('$12.00')).toBeInTheDocument()
  })

  it('increments the quantity with the cart stepper', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Margherita Pizza/ }))

    const panel = orderPanel()
    const stepper = panel.getByRole('spinbutton', { name: /Quantity of Margherita Pizza/ })
    expect(stepper).toHaveValue(1)

    await user.click(panel.getByRole('button', { name: /Increase quantity of Margherita Pizza/ }))

    expect(panel.getByRole('spinbutton', { name: /Quantity of Margherita Pizza/ })).toHaveValue(2)
    expect(orderSubtotal().getByText('$28.00')).toBeInTheDocument()
  })

  it('shows a confirmation step before submitting', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))

    const dialog = screen.getByRole('dialog', { name: /Confirm your order/ })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/Club Sandwich/)).toBeInTheDocument()
    expect(within(dialog).getAllByText('$12.00').length).toBe(2)
    expect(within(dialog).getByRole('button', { name: /Confirm order/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Go back/ })).toBeInTheDocument()
  })

  it('allows going back from confirmation to edit the order', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))

    expect(screen.getByRole('dialog', { name: /Confirm your order/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Go back/ }))

    expect(screen.queryByRole('dialog', { name: /Confirm your order/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Review order/ })).toBeInTheDocument()
  })

  it('submits the order after confirmation and shows orderId', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    expect(await screen.findByRole('heading', { name: 'Order confirmed' })).toBeInTheDocument()
    expect(screen.getByText(/Order test-ord/)).toBeInTheDocument()
    expect(screen.getByText('Order received')).toBeInTheDocument()

    const [route, payload] = mocks.submit.mock.calls[0] as [string, Record<string, unknown>]
    expect(route).toBe('POST /api/room-service')
    expect(payload).toMatchObject({
      mode: 'QR_ROOM_SERVICE',
      roomNumber: 305,
      items: [{ itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 }],
    })
  })

  it('displays server-returned total in confirmation', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    await screen.findByRole('heading', { name: 'Order confirmed' })

    const totalRow = screen.getByText('Total').closest('.order-confirmation__total')!
    expect(totalRow).toHaveTextContent('$12.00')
  })

  it('displays server-returned items in confirmation', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    await screen.findByRole('heading', { name: 'Order confirmed' })

    const itemsList = screen.getByText('Total').closest('.order-confirmation')!.querySelector('.order-confirmation__items')!
    expect(itemsList).toHaveTextContent('Club Sandwich')
    expect(itemsList).toHaveTextContent('x1')
  })

  it('refreshes order status on button click', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    await screen.findByRole('heading', { name: 'Order confirmed' })
    expect(screen.getByText('Order received')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Refresh status/ }))

    expect(await screen.findByText('Being prepared')).toBeInTheDocument()
    expect(mocks.checkOrderStatus).toHaveBeenCalledWith('test-order-123')
  })

  it('handles status refresh error without losing confirmation data', async () => {
    const user = userEvent.setup()
    mocks.checkOrderStatus.mockImplementation(async () => ({
      status: 'error',
      requestId: 'err',
      message: 'Order not found',
      code: 'NOT_FOUND',
    }))
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    await screen.findByRole('heading', { name: 'Order confirmed' })
    await user.click(screen.getByRole('button', { name: /Refresh status/ }))

    await screen.findByText('Order not found')
    expect(screen.getByText(/Order test-ord/)).toBeInTheDocument()
    const totalRow = screen.getByText('Total').closest('.order-confirmation__total')!
    expect(totalRow).toHaveTextContent('$12.00')
  })

  it('shows inline quantity stepper in menu for items in cart', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))

    const menuPanel = screen.getByRole('heading', { name: 'Menu' }).closest('.card')!
    const menuContent = within(menuPanel as HTMLElement)
    expect(menuContent.getByRole('spinbutton', { name: /Quantity of Club Sandwich/ })).toBeInTheDocument()
    expect(menuContent.queryByRole('button', { name: /Add.*Club Sandwich/ })).not.toBeInTheDocument()
  })

  it('removes item from cart via remove button', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))

    const panel = orderPanel()
    expect(panel.getByText('Club Sandwich')).toBeInTheDocument()

    await user.click(panel.getByRole('button', { name: /Remove Club Sandwich from order/ }))

    expect(panel.queryByText('Club Sandwich')).not.toBeInTheDocument()
    expect(screen.getByText('Your order is empty')).toBeInTheDocument()
  })

  it('preserves cart after submission error', async () => {
    const user = userEvent.setup()
    mocks.submit.mockImplementationOnce(async () => ({
      status: 'error',
      requestId: 'err',
      message: 'The automation layer is unavailable.',
      code: 'AUTOMATION_FAILED',
    }))
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Try again/ }))

    const panel = orderPanel()
    expect(panel.getByText('Club Sandwich')).toBeInTheDocument()
    expect(panel.getByRole('spinbutton', { name: /Quantity of Club Sandwich/ })).toHaveValue(1)
  })

  it('resets the cart when placing another order', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Add.*Club Sandwich/ }))
    await user.type(screen.getByRole('spinbutton', { name: /Room number/ }), '305')
    await user.click(screen.getByRole('button', { name: /Review order/ }))
    await user.click(screen.getByRole('button', { name: /Confirm order/ }))

    await screen.findByRole('heading', { name: 'Order confirmed' })
    await user.click(screen.getByRole('button', { name: /Place another order/ }))

    expect(screen.getByText('Your order is empty')).toBeInTheDocument()
  })
})
