/**
 * Force password change page.
 *
 * Shown when a user logs in with must_change_password = true.
 * Blocks all other navigation until password is changed.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

export function ChangePasswordPage() {
  const { changePassword, logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!currentPassword || !newPassword) {
      setError('Please fill in all fields')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      if (result.success) {
        navigate('/staff', { replace: true })
      } else {
        setError(result.error ?? 'Password change failed')
      }
    } catch {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1 className="login-title">Change Password</h1>
          <p className="login-subtitle">
            You must change your password before continuing.
            Your current password is a temporary one that must be replaced.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="login-field">
            <label htmlFor="currentPassword" className="login-label">
              Current Password
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="login-input"
              placeholder="Enter your current password"
              autoComplete="current-password"
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="login-field">
            <label htmlFor="newPassword" className="login-label">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="login-input"
              placeholder="Enter your new password (min 6 characters)"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="confirmPassword" className="login-label">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="login-input"
              placeholder="Confirm your new password"
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>

          <button
            type="button"
            className="login-button login-button--secondary"
            onClick={handleLogout}
            disabled={loading}
          >
            Sign Out
          </button>
        </form>
      </div>
    </div>
  )
}
