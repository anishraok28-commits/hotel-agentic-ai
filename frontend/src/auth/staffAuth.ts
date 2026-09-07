/**
 * Staff role management (frontend).
 *
 * Roles: FRONT_DESK, KITCHEN, MANAGER, OWNER
 *
 * This is UI gating only. Backend enforces role permissions on specific endpoints.
 * For the pilot, role is stored in sessionStorage and can be changed via the role selector.
 */

export type StaffRole = 'FRONT_DESK' | 'KITCHEN' | 'MANAGER' | 'OWNER'

const STAFF_ROLE_KEY = 'pilot-staff-role'

/** All available staff roles. */
export const ALL_STAFF_ROLES: readonly StaffRole[] = [
  'FRONT_DESK',
  'KITCHEN',
  'MANAGER',
  'OWNER',
]

/** Human-readable role labels. */
export const STAFF_ROLE_LABELS: Readonly<Record<StaffRole, string>> = {
  FRONT_DESK: 'Front Desk',
  KITCHEN: 'Kitchen',
  MANAGER: 'Manager',
  OWNER: 'Owner',
}

/** Role permissions for UI gating. */
export const ROLE_PERMISSIONS: Readonly<Record<StaffRole, ReadonlySet<string>>> = {
  FRONT_DESK: new Set(['orders', 'rooms-qr-view']),
  KITCHEN: new Set(['orders']),
  MANAGER: new Set(['orders', 'rooms-qr-view', 'rooms-qr-manage', 'dashboard']),
  OWNER: new Set(['dashboard']),
}

/** Get the current staff role from sessionStorage. Defaults to FRONT_DESK. */
export function getCurrentRole(): StaffRole {
  try {
    const stored = sessionStorage.getItem(STAFF_ROLE_KEY)
    if (stored && isStaffRole(stored)) return stored
  } catch {
    // sessionStorage may be unavailable
  }
  return 'FRONT_DESK'
}

/** Set the current staff role in sessionStorage. */
export function setCurrentRole(role: StaffRole): void {
  try {
    sessionStorage.setItem(STAFF_ROLE_KEY, role)
  } catch {
    // sessionStorage may be unavailable
  }
}

/** Clear the current staff role from sessionStorage. */
export function clearCurrentRole(): void {
  try {
    sessionStorage.removeItem(STAFF_ROLE_KEY)
  } catch {
    // sessionStorage may be unavailable
  }
}

/** Check if a value is a valid StaffRole. */
function isStaffRole(value: string): value is StaffRole {
  return ALL_STAFF_ROLES.includes(value as StaffRole)
}

/** Check if a role has a specific permission. */
export function hasPermission(role: StaffRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}
