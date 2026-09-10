/**
 * Protected route wrapper.
 *
 * Redirects to login if the user is not authenticated.
 * Optionally checks for specific roles.
 */

import { Navigate } from 'react-router-dom'
import { useAuth, type StaffRole } from '@/auth/AuthContext'

interface ProtectedRouteProps {
  readonly children: React.ReactNode
  readonly requiredRoles?: readonly StaffRole[]
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (requiredRoles && user && !requiredRoles.includes(user.role)) {
    // User doesn't have required role - redirect to staff (they can see what they have access to)
    return <Navigate to="/staff" replace />
  }

  return <>{children}</>
}
