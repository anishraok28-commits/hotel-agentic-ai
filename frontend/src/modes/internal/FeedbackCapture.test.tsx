import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FeedbackCapture } from './FeedbackCapture'

function renderView() {
  return render(
    <MemoryRouter>
      <FeedbackCapture />
    </MemoryRouter>,
  )
}

describe('FeedbackCapture', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the feedback form with all four questions', () => {
    renderView()
    expect(screen.getByRole('heading', { name: 'Feedback Capture' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Hotel.*property name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Contact name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/What worked/)).toBeInTheDocument()
    expect(screen.getByLabelText(/What frustrated/)).toBeInTheDocument()
    expect(screen.getByLabelText(/What was missing/)).toBeInTheDocument()
    expect(screen.getByLabelText(/keep paying for this/)).toBeInTheDocument()
  })

  it('submits and stores feedback entry', async () => {
    const user = userEvent.setup()
    renderView()

    await user.type(screen.getByLabelText(/Hotel.*property name/), 'Demo Hotel')
    await user.type(screen.getByLabelText(/Contact name/), 'Manager')
    await user.type(screen.getByLabelText(/What worked/), 'QR scanning was seamless')
    await user.type(screen.getByLabelText(/What frustrated/), 'Nothing significant')
    await user.type(screen.getByLabelText(/What was missing/), 'Room upgrades')
    await user.type(screen.getByLabelText(/keep paying for this/), 'Multi-language')
    await user.click(screen.getByRole('button', { name: /Save feedback/ }))

    expect(await screen.getByText('Feedback recorded')).toBeInTheDocument()

    // Verify it was stored
    const stored = JSON.parse(localStorage.getItem('hotel-internal-feedback')!)
    expect(stored).toHaveLength(1)
    expect(stored[0].hotelName).toBe('Demo Hotel')
    expect(stored[0].contactName).toBe('Manager')
    expect(stored[0].whatWorked).toBe('QR scanning was seamless')
  })

  it('does not allow submission without required fields', async () => {
    const user = userEvent.setup()
    renderView()

    await user.click(screen.getByRole('button', { name: /Save feedback/ }))

    // Form should not have submitted (HTML5 required validation)
    expect(screen.queryByText('Feedback recorded')).not.toBeInTheDocument()
  })
})
