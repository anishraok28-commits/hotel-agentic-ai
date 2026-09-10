/**
 * Staff login page.
 *
 * Simple form for staff to authenticate with identifier + password.
 * On success, redirects to the staff dashboard.
 * If mustChangePassword is true, redirects to password change.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/staff', { replace: true })
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!identifier.trim() || !password) {
      setError('Please enter both identifier and password')
      return
    }

    setLoading(true)
    try {
      const result = await login(identifier.trim(), password)
      if (result.success) {
        if (result.mustChangePassword) {
          navigate('/change-password', { replace: true })
        } else {
          navigate('/staff', { replace: true })
        }
      } else {
        setError(result.error ?? 'Login failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Staff Login</h1>
          <p className="login-subtitle">Enter your credentials to access the dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="login-field">
            <label htmlFor="identifier" className="login-label">
              Identifier
            </label>
            <input
              id="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="login-input"
              placeholder="Enter your identifier"
              autoComplete="username"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
