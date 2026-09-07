import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const mocks = vi.hoisted(() => ({
  listRooms: vi.fn(),
  createRoom: vi.fn(),
  updateRoom: vi.fn(),
  deleteRoom: vi.fn(),
}))

vi.mock('@/api/mockTransport', () => ({
  MOCK_API_ENABLED: true,
  listRooms: mocks.listRooms,
  createRoom: mocks.createRoom,
  updateRoom: mocks.updateRoom,
  deleteRoom: mocks.deleteRoom,
}))

import { StaffRoomsQRView } from './StaffRoomsQRView'

function renderView() {
  return render(
    <MemoryRouter>
      <StaffRoomsQRView />
    </MemoryRouter>,
  )
}

const SAMPLE_ROOMS = [
  {
    roomNumber: 101,
    qrToken: 'mock-token-101-1234567890',
    active: true,
    createdAt: 1234567890,
    updatedAt: 1234567890,
  },
  {
    roomNumber: 102,
    qrToken: 'mock-token-102-1234567890',
    active: true,
    createdAt: 1234567890,
    updatedAt: 1234567890,
  },
  {
    roomNumber: 103,
    qrToken: '',
    active: true,
    createdAt: 1234567890,
    updatedAt: 1234567890,
  },
]

describe('StaffRoomsQRView', () => {
  beforeEach(() => {
    mocks.listRooms.mockReset()
    mocks.createRoom.mockReset()
    mocks.updateRoom.mockReset()
    mocks.deleteRoom.mockReset()
    mocks.listRooms.mockResolvedValue({ rooms: SAMPLE_ROOMS })
    mocks.createRoom.mockResolvedValue({
      room: {
        roomNumber: 201,
        qrToken: 'mock-token-201-1234567890',
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      qrUrl: 'http://localhost:5173/?token=mock-token-201-1234567890',
    })
  })

  it('renders the page header', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Generate QR' })).toBeInTheDocument()
  })

  it('shows a loading state initially', () => {
    renderView()
    expect(screen.getByText('Loading rooms...')).toBeInTheDocument()
  })

  it('displays rooms after loading', async () => {
    renderView()
    expect(await screen.findByText('Room 101')).toBeInTheDocument()
    expect(screen.getByText('Room 102')).toBeInTheDocument()
    expect(screen.getByText('Room 103')).toBeInTheDocument()
  })

  it('shows room count', async () => {
    renderView()
    expect(await screen.findByText('3 rooms configured')).toBeInTheDocument()
  })

  it('shows QR state badges', async () => {
    renderView()
    await screen.findByText('Room 101')
    expect(screen.getAllByText('Generated').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Not Generated')).toBeInTheDocument()
  })

  it('shows the generate QR form', async () => {
    renderView()
    expect(await screen.findByRole('button', { name: /Generate QR/ })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /Room number/i })).toBeInTheDocument()
  })

  it('shows the generate button', async () => {
    renderView()
    expect(await screen.findByRole('button', { name: /Generate QR/ })).toBeInTheDocument()
  })

  it('creates a new room when form is submitted', async () => {
    renderView()
    await screen.findByText('Room 101')

    const input = screen.getByRole('spinbutton', { name: /Room number/i })
    fireEvent.input(input, { target: { value: '201' } })
    fireEvent.submit(input.closest('form')!)

    expect(mocks.createRoom).toHaveBeenCalledWith(201)
  })

  it('validates room number input', async () => {
    renderView()
    await screen.findByText('Room 101')

    const input = screen.getByRole('spinbutton', { name: /Room number/i })
    fireEvent.input(input, { target: { value: '99999' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByText(/Room number must be an integer/)).toBeInTheDocument()
  })

  it('rejects duplicate room numbers', async () => {
    renderView()
    await screen.findByText('Room 101')

    const input = screen.getByRole('spinbutton', { name: /Room number/i })
    fireEvent.input(input, { target: { value: '101' } })
    fireEvent.submit(input.closest('form')!)

    expect(await screen.findByText(/Room 101 already exists/)).toBeInTheDocument()
  })

  it('shows show QR buttons for each room', async () => {
    renderView()
    await screen.findByText('Room 101')
    const showButtons = screen.getAllByRole('button', { name: /Show QR/ })
    expect(showButtons.length).toBeGreaterThanOrEqual(3)
  })

  it('shows an error state when loading fails', async () => {
    mocks.listRooms.mockRejectedValue(new Error('Network error'))
    renderView()

    expect(await screen.findByText('Error')).toBeInTheDocument()
    expect(screen.getByText('Failed to load rooms.')).toBeInTheDocument()
  })

  it('shows an empty state when no rooms exist', async () => {
    mocks.listRooms.mockResolvedValue({ rooms: [] })
    renderView()

    expect(await screen.findByText('No rooms configured')).toBeInTheDocument()
    expect(screen.getByText('Create a room above to generate its QR code.')).toBeInTheDocument()
  })

  it('allows retry after error', async () => {
    const user = userEvent.setup()
    mocks.listRooms.mockRejectedValueOnce(new Error('fail'))
    renderView()

    await screen.findByText('Error')

    mocks.listRooms.mockResolvedValue({ rooms: SAMPLE_ROOMS })
    await user.click(screen.getByRole('button', { name: /Retry/ }))

    expect(await screen.findByText('Room 101')).toBeInTheDocument()
  })

  it('shows back to orders link', async () => {
    renderView()
    await screen.findByText('Room 101')
    expect(screen.getByText('Back to Orders')).toBeInTheDocument()
  })

  it('shows deactivate buttons for active rooms', async () => {
    renderView()
    await screen.findByText('Room 101')
    const deactivateButtons = screen.getAllByRole('button', { name: /Deactivate/ })
    expect(deactivateButtons.length).toBeGreaterThanOrEqual(2)
  })

  it('deactivates a room when deactivate button is clicked', async () => {
    const user = userEvent.setup()
    mocks.deleteRoom.mockResolvedValue({ success: true })
    renderView()
    await screen.findByText('Room 101')

    const deactivateButton = screen.getAllByRole('button', { name: /Deactivate/ })[0]
    await user.click(deactivateButton)

    expect(mocks.deleteRoom).toHaveBeenCalledWith(101)
  })
})
