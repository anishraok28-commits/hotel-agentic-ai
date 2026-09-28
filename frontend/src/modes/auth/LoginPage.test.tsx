import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthContext'
import { LoginPage } from '@/modes/auth/LoginPage'

const renderWithRouter = (initialEntries: string[]) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('shows session expired message when sessionExpired=1 query param present', async () => {
    renderWithRouter(['/login?sessionExpired=1'])

    await waitFor(() => {
      // error is rendered inside a div with role="alert"
      expect(screen.getByRole('alert')).toHaveTextContent('Session expired, please sign in again.')
    })
  })

  it('does not show session expired message when query param absent', async () => {
    renderWithRouter(['/login'])

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})