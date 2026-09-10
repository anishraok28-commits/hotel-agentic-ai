/**
 * Staff authentication context.
 *
 * Manages login state, token storage, and provides auth info to the app.
 * Uses sessionStorage for persistence across page reloads.
 */

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { appConfig, MOCK_API_ENABLED } from '@/config/appConfig'

export type StaffRole = 'FRONT_DESK' | 'KITCHEN' | 'MANAGER' | 'OWNER'

export interface StaffUser {
  readonly id: string
  readonly name: string
  readonly identifier: string
  readonly role: StaffRole
}

export interface AuthContextValue {
  readonly token: string | null
  readonly user: StaffUser | null
  readonly isAuthenticated: boolean
  readonly login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string; mustChangePassword?: boolean }>
  readonly logout: () => Promise<void>
  readonly changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  readonly getAuthHeaders: () => Record<string, string>
}

const AUTH_TOKEN_KEY = 'staff-auth-token'
const AUTH_USER_KEY = 'staff-auth-user'

function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

function getStoredUser(): StaffUser | null {
  try {
    const raw = sessionStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StaffUser
  } catch {
    return null
  }
}

function storeAuth(token: string, user: StaffUser): void {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  } catch {
    // sessionStorage may be unavailable
  }
}

function clearAuth(): void {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY)
    sessionStorage.removeItem(AUTH_USER_KEY)
  } catch {
    // sessionStorage may be unavailable
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Mock login for development without backend. */
async function mockLogin(
  identifier: string,
  _password: string,
): Promise<{ success: boolean; token?: string; user?: StaffUser; error?: string; mustChangePassword?: boolean }> {
  await new Promise((r) => setTimeout(r, 300))

  const roleMap: Record<string, StaffRole> = {
    frontdesk: 'FRONT_DESK',
    kitchen: 'KITCHEN',
    manager: 'MANAGER',
    owner: 'OWNER',
  }

  const role = roleMap[identifier]
  if (!role) {
    return { success: false, error: 'Invalid credentials' }
  }

  // In mock mode, simulate must_change_password for default password
  if (_password === 'hotel123') {
    return {
      success: true,
      token: `mock-staff-token-${identifier}-${Date.now()}`,
      user: {
        id: `staff-${identifier}`,
        name: `${identifier.charAt(0).toUpperCase() + identifier.slice(1)} Staff`,
        identifier,
        role,
      },
      mustChangePassword: true,
    }
  }

  return {
    success: true,
    token: `mock-staff-token-${identifier}-${Date.now()}`,
    user: {
      id: `staff-${identifier}`,
      name: `${identifier.charAt(0).toUpperCase() + identifier.slice(1)} Staff`,
      identifier,
      role,
    },
  }
}

async function realLogin(
  identifier: string,
  password: string,
): Promise<{ success: boolean; token?: string; user?: StaffUser; error?: string; mustChangePassword?: boolean }> {
  const url = `${appConfig.apiBaseUrl}/api/auth/login`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const body = await response.json() as Record<string, unknown>
      return { success: false, error: (body.message as string) ?? 'Login failed' }
    }

    const body = await response.json() as Record<string, unknown>
    if (body.status === 'ok' && body.data) {
      const data = body.data as Record<string, unknown>
      const userData = data.user as Record<string, unknown>
      return {
        success: true,
        token: data.token as string,
        user: {
          id: userData.id as string,
          name: userData.name as string,
          identifier: userData.identifier as string,
          role: userData.role as StaffRole,
        },
        mustChangePassword: userData.mustChangePassword as boolean | undefined,
      }
    }

    return { success: false, error: 'Invalid response format' }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { success: false, error: 'Request timed out' }
    }
    return { success: false, error: 'Network error' }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(getStoredToken)
  const [user, setUser] = useState<StaffUser | null>(getStoredUser)

  const login = useCallback(async (identifier: string, password: string) => {
    const result = MOCK_API_ENABLED
      ? await mockLogin(identifier, password)
      : await realLogin(identifier, password)

    if (result.success && result.token && result.user) {
      storeAuth(result.token, result.user)
      setToken(result.token)
      setUser(result.user)
      return { success: true, mustChangePassword: result.mustChangePassword }
    }

    return { success: false, error: result.error }
  }, [])

  const logout = useCallback(async () => {
    // Try to call the backend logout to invalidate the token
    if (token && !MOCK_API_ENABLED) {
      try {
        await fetch(`${appConfig.apiBaseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        })
      } catch {
        // Ignore errors - we'll clear local state regardless
      }
    }
    clearAuth()
    setToken(null)
    setUser(null)
  }, [token])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!token) return { success: false, error: 'Not authenticated' }

    if (MOCK_API_ENABLED) {
      await new Promise((r) => setTimeout(r, 300))
      // In mock mode, just succeed
      return { success: true }
    }

    const url = `${appConfig.apiBaseUrl}/api/auth/change-password`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!response.ok) {
        const body = await response.json() as Record<string, unknown>
        return { success: false, error: (body.message as string) ?? 'Password change failed' }
      }

      const body = await response.json() as Record<string, unknown>
      if (body.status === 'ok' && body.data) {
        const data = body.data as Record<string, unknown>
        // Update token if server issued a new one
        if (data.token) {
          const newToken = data.token as string
          sessionStorage.setItem(AUTH_TOKEN_KEY, newToken)
          setToken(newToken)
        }
        return { success: true }
      }

      return { success: false, error: 'Invalid response format' }
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { success: false, error: 'Request timed out' }
      }
      return { success: false, error: 'Network error' }
    }
  }, [token])

  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (!token) return {}
    return { 'Authorization': `Bearer ${token}` }
  }, [token])

  const value = useMemo<AuthContextValue>(() => ({
    token,
    user,
    isAuthenticated: !!token && !!user,
    login,
    logout,
    changePassword,
    getAuthHeaders,
  }), [token, user, login, logout, changePassword, getAuthHeaders])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Get the current auth token for API calls. */
export function getAuthToken(): string | null {
  return getStoredToken()
}
