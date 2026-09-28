/**
 * Staff user management API functions.
 *
 * Uses the same auth pattern as other API calls in the frontend.
 */

import type {
  StaffUserListItem,
  CreateUserRequest,
  UpdateUserRoleRequest,
} from '@/api/types'
import type { StaffRole } from '@/auth/AuthContext'
import { appConfig, MOCK_API_ENABLED } from '@/config/appConfig'
import { authFetch } from '@/api/authFetch'

interface ApiResponse<T> {
  status: 'ok' | 'error'
  requestId: string
  message: string
  data?: T
}

// ─── Mock Data ────────────────────────────────────────────────────────

let mockUsers: StaffUserListItem[] = [
  {
    id: 'seed-owner-1',
    name: 'Hotel Owner',
    identifier: 'owner',
    role: 'OWNER',
    active: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-manager-1',
    name: 'Hotel Manager',
    identifier: 'manager',
    role: 'MANAGER',
    active: true,
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-frontdesk-1',
    name: 'Front Desk Staff',
    identifier: 'frontdesk',
    role: 'FRONT_DESK',
    active: true,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'seed-kitchen-1',
    name: 'Kitchen Staff',
    identifier: 'kitchen',
    role: 'KITCHEN',
    active: true,
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
  },
]

// ─── API Functions ────────────────────────────────────────────────────

export async function listUsers(): Promise<{ users: StaffUserListItem[] } | { error: string }> {
  if (MOCK_API_ENABLED) {
    await new Promise((r) => setTimeout(r, 200))
    return { users: mockUsers.filter((u) => u.active) }
  }

  let response: Response
  try {
    response = await authFetch(`${appConfig.apiBaseUrl}/api/admin/users`, { method: 'GET' })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'Request timed out' }
    }
    return { error: 'Network error' }
  }

  if (response.status === 403) {
    return { error: 'Access denied. You lack the required role.' }
  }

  if (!response.ok) {
    const body = await response.json() as ApiResponse<unknown>
    return { error: body.message ?? `Failed to list users (HTTP ${response.status})` }
  }

  const body = await response.json() as ApiResponse<{ users: StaffUserListItem[] }>
  if (body.status === 'ok' && body.data) {
    return { users: body.data.users }
  }

  return { error: 'Invalid response format' }
}

export async function createUser(
  data: CreateUserRequest,
): Promise<{ user: StaffUserListItem } | { error: string }> {
  if (MOCK_API_ENABLED) {
    await new Promise((r) => setTimeout(r, 300))
    const newUser: StaffUserListItem = {
      id: `mock-${Date.now()}`,
      name: data.name,
      identifier: data.identifier,
      role: data.role,
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    }
    mockUsers = [...mockUsers, newUser]
    return { user: newUser }
  }

  let response: Response
  try {
    response = await authFetch(`${appConfig.apiBaseUrl}/api/admin/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'Request timed out' }
    }
    return { error: 'Network error' }
  }

  if (response.status === 403) {
    return { error: 'Access denied. You lack the required role.' }
  }

  if (!response.ok) {
    const body = await response.json() as ApiResponse<unknown>
    return { error: body.message ?? `Failed to create user (HTTP ${response.status})` }
  }

  const body = await response.json() as ApiResponse<{ id: string; name: string; identifier: string; role: StaffRole }>
  if (body.status === 'ok' && body.data) {
    const user: StaffUserListItem = {
      id: body.data.id,
      name: body.data.name,
      identifier: body.data.identifier,
      role: body.data.role,
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString(),
    }
    return { user }
  }

  return { error: 'Invalid response format' }
}

export async function updateUserRole(
  userId: string,
  data: UpdateUserRoleRequest,
): Promise<{ success: boolean } | { error: string }> {
  if (MOCK_API_ENABLED) {
    await new Promise((r) => setTimeout(r, 200))
    mockUsers = mockUsers.map((u) =>
      u.id === userId ? { ...u, role: data.role } : u,
    )
    return { success: true }
  }

  let response: Response
  try {
    response = await authFetch(`${appConfig.apiBaseUrl}/api/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'Request timed out' }
    }
    return { error: 'Network error' }
  }

  if (response.status === 403) {
    return { error: 'Access denied. You lack the required role.' }
  }

  if (!response.ok) {
    const body = await response.json() as ApiResponse<unknown>
    return { error: body.message ?? `Failed to update user (HTTP ${response.status})` }
  }

  return { success: true }
}

export async function deactivateUser(
  userId: string,
): Promise<{ success: boolean } | { error: string }> {
  if (MOCK_API_ENABLED) {
    await new Promise((r) => setTimeout(r, 200))
    mockUsers = mockUsers.map((u) =>
      u.id === userId ? { ...u, active: false } : u,
    )
    return { success: true }
  }

  let response: Response
  try {
    response = await authFetch(`${appConfig.apiBaseUrl}/api/admin/users/${userId}/deactivate`, {
      method: 'POST',
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'Request timed out' }
    }
    return { error: 'Network error' }
  }

  if (response.status === 403) {
    return { error: 'Access denied. You lack the required role.' }
  }

  if (!response.ok) {
    const body = await response.json() as ApiResponse<unknown>
    return { error: body.message ?? `Failed to deactivate user (HTTP ${response.status})` }
  }

  return { success: true }
}

export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ newPassword: string } | { error: string }> {
  if (MOCK_API_ENABLED) {
    await new Promise((r) => setTimeout(r, 200))
    mockUsers = mockUsers.map((u) =>
      u.id === userId ? { ...u, mustChangePassword: true } : u,
    )
    return { newPassword }
  }

  let response: Response
  try {
    response = await authFetch(`${appConfig.apiBaseUrl}/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { error: 'Request timed out' }
    }
    return { error: 'Network error' }
  }

  if (response.status === 403) {
    return { error: 'Access denied. You lack the required role.' }
  }

  if (!response.ok) {
    const body = await response.json() as ApiResponse<unknown>
    return { error: body.message ?? `Failed to reset password (HTTP ${response.status})` }
  }

  const body = await response.json() as ApiResponse<{ newPassword: string }>
  if (body.status === 'ok' && body.data) {
    return { newPassword: body.data.newPassword }
  }

  return { newPassword }
}
