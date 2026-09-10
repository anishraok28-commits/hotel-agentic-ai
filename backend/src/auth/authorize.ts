/**
 * Server-side authorization middleware.
 *
 * Verifies staff tokens AND checks role-based access against the database.
 * This is the ONLY proper way to authorize admin endpoints.
 *
 * IMPORTANT: This middleware does BOTH authentication AND authorization.
 * It verifies the token, looks up the user in the DB, checks token_version
 * for revocation, and verifies the user's role is in the allowed list.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { verifyStaffToken, type TokenPayload } from './staffToken.js'
import { getStaffById } from '../staff/staffRoleStore.js'
import type { StaffRole } from '../staff/staffRoleStore.js'
import type { EnvConfig } from '../config/env.js'

export interface AuthenticatedUser {
  readonly userId: string
  readonly name: string
  readonly identifier: string
  readonly role: StaffRole
  readonly tokenVersion: number
}

export interface AuthSuccess {
  readonly ok: true
  readonly user: AuthenticatedUser
}

export interface AuthFailure {
  readonly ok: false
  readonly statusCode: 401 | 403
  readonly message: string
}

export type AuthResult = AuthSuccess | AuthFailure

/**
 * Authenticate and authorize a request.
 *
 * 1. Extracts and verifies the Bearer token (HMAC signature + expiry)
 * 2. Looks up the user in the database by ID
 * 3. Checks token_version matches (revocation check)
 * 4. Checks user is active
 * 5. Checks user's role is in the allowedRoles list
 */
export function authenticateAndAuthorize(
  req: IncomingMessage,
  env: EnvConfig,
  allowedRoles: readonly StaffRole[],
): AuthResult {
  // Step 1: Extract token
  const header = req.headers.authorization
  if (!header) {
    return { ok: false, statusCode: 401, message: 'Authentication required' }
  }

  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) {
    return { ok: false, statusCode: 401, message: 'Invalid authorization format' }
  }

  // Step 2: Verify token signature and expiry
  const payload: TokenPayload | null = verifyStaffToken(token, env.staffTokenSecret)
  if (!payload) {
    return { ok: false, statusCode: 401, message: 'Invalid or expired token' }
  }

  // Step 3: Look up user in database
  const user = getStaffById(payload.userId)
  if (!user) {
    return { ok: false, statusCode: 401, message: 'User not found' }
  }

  // Step 4: Check user is active
  if (!user.active) {
    return { ok: false, statusCode: 401, message: 'Account deactivated' }
  }

  // Step 5: Check token version (revocation check)
  if (user.tokenVersion !== payload.tokenVersion) {
    return { ok: false, statusCode: 401, message: 'Token revoked' }
  }

  // Step 6: Check role authorization
  if (!allowedRoles.includes(user.role)) {
    return {
      ok: false,
      statusCode: 403,
      message: `Insufficient permissions. Required: ${allowedRoles.join(' or ')}`,
    }
  }

  return {
    ok: true,
    user: {
      userId: user.id,
      name: user.name,
      identifier: user.identifier,
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
  }
}

/**
 * Middleware helper: authenticate + authorize, sending error response if denied.
 * Returns the authenticated user if successful, or sends an error and returns null.
 */
export function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  env: EnvConfig,
  allowedRoles: readonly StaffRole[],
): AuthenticatedUser | null {
  const result = authenticateAndAuthorize(req, env, allowedRoles)
  if (result.ok) return result.user

  const body = {
    status: 'error' as const,
    requestId: crypto.randomUUID(),
    message: result.message,
    code: result.statusCode === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN',
  }

  res.writeHead(result.statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
  return null
}

/** Role hierarchy for permission checks. */
const ROLE_HIERARCHY: Record<StaffRole, number> = {
  FRONT_DESK: 1,
  KITCHEN: 1,
  MANAGER: 2,
  OWNER: 3,
}

/** Check if a role has at least the required level. */
export function hasMinRole(userRole: StaffRole, requiredRole: StaffRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
