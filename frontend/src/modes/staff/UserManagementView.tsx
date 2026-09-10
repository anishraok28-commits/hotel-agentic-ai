/**
 * User Management view for MANAGER and OWNER roles.
 *
 * Displays a table of staff users with actions:
 * - View all staff users
 * - Create new staff user (with temporary password)
 * - Change user role
 * - Deactivate user (soft delete)
 *
 * All actions are audited on the backend.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { ErrorState } from '@/components/state/ErrorState'
import { useAuth, type StaffRole } from '@/auth/AuthContext'
import {
  listUsers,
  createUser,
  updateUserRole,
  deactivateUser,
  resetUserPassword,
} from '@/api/userManagementApi'
import type { StaffUserListItem } from '@/api/types'

const ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  FRONT_DESK: 'Front Desk',
  KITCHEN: 'Kitchen',
  MANAGER: 'Manager',
  OWNER: 'Owner',
}

const ROLE_OPTIONS: StaffRole[] = ['FRONT_DESK', 'KITCHEN', 'MANAGER']

interface CreateFormState {
  name: string
  identifier: string
  role: StaffRole
  password: string
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  identifier: '',
  role: 'FRONT_DESK',
  password: '',
}

export function UserManagementView() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<StaffUserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<string | null>(null)
  const [confirmResetPassword, setConfirmResetPassword] = useState<string | null>(null)
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null)
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<{ id: string; password: string } | null>(null)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [newRole, setNewRole] = useState<StaffRole>('FRONT_DESK')

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await listUsers()
    if ('error' in result) {
      setError(result.error)
    } else {
      setUsers(result.users)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    setCreateSuccess(null)

    const result = await createUser(createForm)
    setCreating(false)

    if ('error' in result) {
      setCreateError(result.error)
    } else {
      setCreateSuccess(`User created. Temporary password: ${createForm.password}`)
      setCreateForm(EMPTY_FORM)
      setShowCreateForm(false)
      void loadUsers()
    }
  }

  async function handleDeactivate(userId: string) {
    setDeactivatingId(userId)
    const result = await deactivateUser(userId)
    setDeactivatingId(null)
    setConfirmDeactivate(null)

    if ('error' in result) {
      setError(result.error)
    } else {
      void loadUsers()
    }
  }

  async function handleResetPassword(userId: string) {
    const tempPassword = `Temp${Date.now().toString(36).slice(-6)}!`
    setResetPasswordId(userId)
    const result = await resetUserPassword(userId, tempPassword)
    setResetPasswordId(null)
    setConfirmResetPassword(null)

    if ('error' in result) {
      setError(result.error)
    } else {
      setResetPasswordSuccess({ id: userId, password: tempPassword })
      void loadUsers()
    }
  }

  async function handleRoleChange(userId: string) {
    const result = await updateUserRole(userId, { role: newRole })
    setEditingRole(null)

    if ('error' in result) {
      setError(result.error)
    } else {
      void loadUsers()
    }
  }

  if (loading) {
    return (
      <section className="mode-page">
        <Card>
          <LoadingState label="Loading users..." />
        </Card>
      </section>
    )
  }

  if (error) {
    return (
      <section className="mode-page">
        <Card>
          <ErrorState title="Error" message={error}>
            <div className="state__actions">
              <Button variant="secondary" onClick={loadUsers}>
                Retry
              </Button>
            </div>
          </ErrorState>
        </Card>
      </section>
    )
  }

  return (
    <section className="mode-page">
      <div className="user-management">
        <div className="user-management__header">
          <h2 className="user-management__title">Staff Accounts</h2>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            <Icon name="sparkles" size={14} />
            <span>{showCreateForm ? 'Cancel' : 'Add Staff'}</span>
          </Button>
        </div>

        {resetPasswordSuccess && (
          <Card title="Password Reset">
            <div className="form-success" role="status">
              Password reset for user. New temporary password: <strong>{resetPasswordSuccess.password}</strong>
              <br />
              <span className="form-hint">User must change this password on next login.</span>
            </div>
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setResetPasswordSuccess(null)}>
                Dismiss
              </Button>
            </div>
          </Card>
        )}

        {showCreateForm && (
          <Card title="Create Staff Account">
            <form className="user-management__form" onSubmit={handleCreate}>
              {createError && (
                <div className="form-error" role="alert">
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div className="form-success" role="status">
                  {createSuccess}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="user-name">Full Name</label>
                <input
                  id="user-name"
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                  placeholder="e.g. John Smith"
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-identifier">Login ID</label>
                <input
                  id="user-identifier"
                  type="text"
                  value={createForm.identifier}
                  onChange={(e) => setCreateForm({ ...createForm, identifier: e.target.value })}
                  required
                  placeholder="e.g. john"
                />
              </div>
              <div className="form-group">
                <label htmlFor="user-role">Role</label>
                <select
                  id="user-role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as StaffRole })}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                  {currentUser?.role === 'OWNER' && (
                    <option value="OWNER">Owner</option>
                  )}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="user-password">Temporary Password</label>
                <input
                  id="user-password"
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Min 6 characters"
                />
                <span className="form-hint">User will be required to change this on first login.</span>
              </div>
              <div className="form-actions">
                <Button type="submit" variant="primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Account'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreateForm(false)
                    setCreateError(null)
                    setCreateSuccess(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card>
          <div className="user-table-wrapper">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login ID</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={!u.active ? 'user-row--inactive' : ''}>
                    <td className="user-table__name">
                      {u.name}
                      {u.id === currentUser?.id && (
                        <span className="user-table__badge">You</span>
                      )}
                    </td>
                    <td>{u.identifier}</td>
                    <td>
                      {editingRole === u.id ? (
                        <div className="inline-edit">
                          <select
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as StaffRole)}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                            {currentUser?.role === 'OWNER' && (
                              <option value="OWNER">Owner</option>
                            )}
                          </select>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleRoleChange(u.id)}
                          >
                            Save
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingRole(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="user-table__role">{ROLE_LABELS[u.role]}</span>
                      )}
                    </td>
                    <td>
                      {u.mustChangePassword ? (
                        <span className="user-table__status user-table__status--pending">
                          Pending Setup
                        </span>
                      ) : u.active ? (
                        <span className="user-table__status user-table__status--active">
                          Active
                        </span>
                      ) : (
                        <span className="user-table__status user-table__status--inactive">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td>
                      {u.id !== currentUser?.id && (
                        <div className="user-table__actions">
                          {editingRole !== u.id && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setEditingRole(u.id)
                                setNewRole(u.role)
                              }}
                            >
                              Edit Role
                            </Button>
                          )}
                          {confirmResetPassword === u.id ? (
                            <div className="inline-confirm">
                              <span>Reset password?</span>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleResetPassword(u.id)}
                                disabled={resetPasswordId === u.id}
                              >
                                {resetPasswordId === u.id ? '...' : 'Yes'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirmResetPassword(null)}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setConfirmResetPassword(u.id)}
                            >
                              Reset Password
                            </Button>
                          )}
                          {confirmDeactivate === u.id ? (
                            <div className="inline-confirm">
                              <span>Deactivate?</span>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDeactivate(u.id)}
                                disabled={deactivatingId === u.id}
                              >
                                {deactivatingId === u.id ? '...' : 'Yes'}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirmDeactivate(null)}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setConfirmDeactivate(u.id)}
                            >
                              Deactivate
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && (
            <ErrorState title="No users found" message="No staff accounts exist." />
          )}
        </Card>
      </div>
    </section>
  )
}
