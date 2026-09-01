import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  listAdminOrders: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: true,
  listAdminOrders: mocks.listAdminOrders,
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
    mocks.listAdminOrders.mockResolvedValue({ orders: SAMPLE_ORDERS })
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
    await user.click(screen.getByRole('button', { name: /Preparing/ }))

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
})
