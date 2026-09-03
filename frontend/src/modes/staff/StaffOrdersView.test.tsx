import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  listAdminOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: true,
  listAdminOrders: mocks.listAdminOrders,
  updateOrderStatus: mocks.updateOrderStatus,
}))

import { StaffOrdersView } from './StaffOrdersView'

function renderView() {
  return render(
    <MemoryRouter>
      <StaffOrdersView />
    </MemoryRouter>,
  )
}

const SAMPLE_ORDERS = [
  {
    orderId: 'order-1',
    roomNumber: 201,
    items: [{ itemId: 'm1', name: 'Burger', quantity: 2, unitPrice: 1500 }],
    total: 3000,
    notes: 'no onions',
    status: 'NEW' as const,
    createdAt: '2026-08-11T10:00:00.000Z',
    updatedAt: '2026-08-11T10:00:00.000Z',
  },
  {
    orderId: 'order-2',
    roomNumber: 305,
    items: [{ itemId: 'm2', name: 'Pizza', quantity: 1, unitPrice: 2000 }],
    total: 2000,
    notes: undefined,
    status: 'PREPARING' as const,
    createdAt: '2026-08-11T10:30:00.000Z',
    updatedAt: '2026-08-11T10:35:00.000Z',
  },
]

describe('StaffOrdersView', () => {
  beforeEach(() => {
    mocks.listAdminOrders.mockReset()
    mocks.updateOrderStatus.mockReset()
    mocks.listAdminOrders.mockResolvedValue({ orders: SAMPLE_ORDERS })
    mocks.updateOrderStatus.mockResolvedValue({
      status: 'accepted',
      requestId: 'stub',
      message: 'Updated',
      data: { orderId: 'order-1', status: 'PREPARING', updatedAt: new Date().toISOString() },
    })
  })

  it('renders the page header', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Active Orders' })).toBeInTheDocument()
  })

  it('shows a loading state initially', () => {
    renderView()
    expect(screen.getByText('Loading orders...')).toBeInTheDocument()
  })

  it('displays orders after loading', async () => {
    renderView()
    expect(await screen.findByText(/Burger/)).toBeInTheDocument()
    expect(screen.getByText(/Pizza/)).toBeInTheDocument()
  })

  it('shows room numbers', async () => {
    renderView()
    await screen.findByText(/Burger/)
    expect(screen.getByText('Room 201')).toBeInTheDocument()
    expect(screen.getByText('Room 305')).toBeInTheDocument()
  })

  it('shows order totals formatted as currency', async () => {
    renderView()
    await screen.findByText(/Burger/)
    expect(screen.getAllByText('$30.00').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$20.00').length).toBeGreaterThanOrEqual(1)
  })

  it('shows order notes when present', async () => {
    renderView()
    expect(await screen.findByText(/no onions/)).toBeInTheDocument()
  })

  it('shows status badges', async () => {
    renderView()
    await screen.findByText(/Burger/)
    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Preparing').length).toBeGreaterThan(0)
  })

  it('shows filter buttons for each status', async () => {
    renderView()
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /New/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Preparing/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ready/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delivered/ })).toBeInTheDocument()
  })

  it('filters orders by status when filter is clicked', async () => {
    const user = userEvent.setup()
    mocks.listAdminOrders.mockResolvedValue({ orders: [SAMPLE_ORDERS[0]] })
    renderView()

    await screen.findByText(/Burger/)

    mocks.listAdminOrders.mockResolvedValue({ orders: [SAMPLE_ORDERS[1]] })
    const filterGroup = screen.getByRole('group', { name: /Order status filter/ })
    await user.click(within(filterGroup).getByRole('button', { name: /Preparing/ }))

    expect(await screen.findByText(/Pizza/)).toBeInTheDocument()
    expect(mocks.listAdminOrders).toHaveBeenCalledWith('PREPARING')
  })

  it('shows a refresh button', async () => {
    const user = userEvent.setup()
    renderView()
    await screen.findByText(/Burger/)

    mocks.listAdminOrders.mockResolvedValue({
      orders: [...SAMPLE_ORDERS, {
        orderId: 'order-3',
        roomNumber: 400,
        items: [],
        total: 0,
        notes: undefined,
        status: 'READY' as const,
        createdAt: '2026-08-11T11:00:00.000Z',
        updatedAt: '2026-08-11T11:00:00.000Z',
      }],
    })
    await user.click(screen.getByRole('button', { name: /Refresh/ }))

    expect(await screen.findByText('Room 400')).toBeInTheDocument()
  })

  it('shows an error state when loading fails', async () => {
    mocks.listAdminOrders.mockRejectedValue(new Error('Network error'))
    renderView()

    expect(await screen.findByText('Could not load orders')).toBeInTheDocument()
    expect(screen.getByText('Failed to load orders.')).toBeInTheDocument()
  })

  it('shows an empty state when no orders exist', async () => {
    mocks.listAdminOrders.mockResolvedValue({ orders: [] })
    renderView()

    expect(await screen.findByText('No orders found')).toBeInTheDocument()
    expect(screen.getByText('No orders have been placed yet.')).toBeInTheDocument()
  })

  it('shows a filtered empty state', async () => {
    const user = userEvent.setup()
    mocks.listAdminOrders.mockResolvedValue({ orders: [] })
    renderView()

    await screen.findByText('No orders found')

    mocks.listAdminOrders.mockResolvedValue({ orders: [] })
    await user.click(screen.getByRole('button', { name: /Delivered/ }))

    expect(await screen.findByText('No delivered orders.')).toBeInTheDocument()
  })

  it('allows retry after error', async () => {
    const user = userEvent.setup()
    mocks.listAdminOrders.mockRejectedValueOnce(new Error('fail'))
    renderView()

    await screen.findByText('Could not load orders')

    mocks.listAdminOrders.mockResolvedValue({ orders: SAMPLE_ORDERS })
    await user.click(screen.getByRole('button', { name: /Try again/ }))

    expect(await screen.findByText(/Burger/)).toBeInTheDocument()
  })

  it('shows order IDs', async () => {
    renderView()
    await screen.findByText(/Burger/)
    expect(screen.getByText(/Order order-1/)).toBeInTheDocument()
    expect(screen.getByText(/Order order-2/)).toBeInTheDocument()
  })

  it('shows status advance buttons for non-terminal orders', async () => {
    renderView()
    await screen.findByText(/Burger/)
    expect(screen.getByRole('button', { name: /Start Preparing/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mark Ready/ })).toBeInTheDocument()
  })

  it('does not show advance button for delivered orders', async () => {
    mocks.listAdminOrders.mockResolvedValue({
      orders: [{
        ...SAMPLE_ORDERS[0],
        status: 'DELIVERED' as const,
      }],
    })
    renderView()
    await screen.findByText(/Burger/)
    expect(screen.queryByRole('button', { name: /Mark/ })).not.toBeInTheDocument()
  })

  it('advances order status on button click and reloads', async () => {
    const user = userEvent.setup()
    mocks.listAdminOrders.mockResolvedValueOnce({ orders: [SAMPLE_ORDERS[0]] })
    renderView()

    await screen.findByText(/Burger/)
    await user.click(screen.getByRole('button', { name: /Start Preparing/ }))

    expect(mocks.updateOrderStatus).toHaveBeenCalledWith('order-1', 'PREPARING')
    expect(await screen.findByText(/Burger/)).toBeInTheDocument()
    expect(screen.getAllByText('New').length).toBeGreaterThanOrEqual(1)
  })

  it('shows error when status update fails', async () => {
    const user = userEvent.setup()
    mocks.updateOrderStatus.mockResolvedValueOnce({
      status: 'error',
      requestId: 'err',
      message: 'Cannot transition from DELIVERED to PREPARING',
      code: 'INVALID_REQUEST',
    })
    mocks.listAdminOrders.mockResolvedValueOnce({ orders: [SAMPLE_ORDERS[0]] })
    renderView()

    await screen.findByText(/Burger/)
    await user.click(screen.getByRole('button', { name: /Start Preparing/ }))

    expect(await screen.findByText('Status update failed')).toBeInTheDocument()
  })

  it('allows dismissing status update error', async () => {
    const user = userEvent.setup()
    mocks.updateOrderStatus.mockResolvedValueOnce({
      status: 'error',
      requestId: 'err',
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR',
    })
    mocks.listAdminOrders.mockResolvedValueOnce({ orders: [SAMPLE_ORDERS[0]] })
    renderView()

    await screen.findByText(/Burger/)
    await user.click(screen.getByRole('button', { name: /Start Preparing/ }))

    await screen.findByText('Status update failed')
    await user.click(screen.getByRole('button', { name: /Dismiss/ }))

    expect(screen.queryByText('Status update failed')).not.toBeInTheDocument()
  })
})
