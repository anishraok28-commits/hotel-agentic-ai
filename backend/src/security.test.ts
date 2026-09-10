/**
 * Security attack tests.
 *
 * Tests that verify the authorization model is properly enforced.
 * Tests the authenticateAndAuthorize function directly.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHmac } from 'node:crypto'
import { getDatabase, closeDatabase } from './db/database.js'
import { createStaffUser, clearStaffUsers, getStaffByIdentifier, deactivateStaffUser, changeStaffPassword } from './staff/staffRoleStore.js'
import { createStaffToken } from './auth/staffToken.js'
import { authenticateAndAuthorize } from './auth/authorize.js'
import type { StaffRole } from './staff/staffRoleStore.js'

const TEST_SECRET = 'test-staff-secret-key-for-security-tests'

function createMockReq(token?: string): any {
  const headers: Record<string, string> = {}
  if (token) headers['authorization'] = `Bearer ${token}`
  return { headers }
}

const mockEnv = {
  nodeEnv: 'local' as const,
  staffTokenSecret: TEST_SECRET,
  qrTokenSecret: 'test-qr-secret',
  serviceToken: 'test-service-token',
  allowedOrigins: ['http://localhost:5173'],
  rateLimitWindowSeconds: 60,
  rateLimitMax: 100,
  port: 0,
  makeBookingWebhookUrl: 'http://test',
  makeRoomServiceWebhookUrl: 'http://test',
  makeLateCheckoutWebhookUrl: 'http://test',
  sessionTtlHours: 24,
  dbPath: ':memory:',
}

describe('Security Attack Tests', () => {
  beforeAll(() => {
    // getDatabase(':memory:') creates a fresh in-memory DB with full schema
    getDatabase(':memory:')

    // Create test users
    createStaffUser('staff-001', 'Front Desk', 'frontdesk', 'FRONT_DESK', 'password123', false)
    createStaffUser('staff-002', 'Kitchen Staff', 'kitchen', 'KITCHEN', 'password123', false)
    createStaffUser('staff-003', 'Hotel Manager', 'manager', 'MANAGER', 'password123', false)
    createStaffUser('staff-004', 'Hotel Owner', 'owner', 'OWNER', 'password123', false)
  })

  afterAll(() => {
    clearStaffUsers()
    closeDatabase()
  })

  describe('Test 1: Unauthenticated user is denied', () => {
    it('should return 401 when no token is provided', () => {
      const req = createMockReq()
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
      }
    })
  })

  describe('Test 2: Invalid token is rejected', () => {
    it('should return 401 when token is invalid', () => {
      const req = createMockReq('invalid-token')
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
      }
    })
  })

  describe('Test 3: Revoked token is rejected', () => {
    it('should return 401 when token version mismatches', () => {
      // Token created with version 1, but user now has version 2
      const user = getStaffByIdentifier('owner')!
      const token = createStaffToken(user.id, 1, TEST_SECRET) // Version 1

      // Simulate version bump (as if password was changed)
      changeStaffPassword(user.id, 'newpassword123')

      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.message).toContain('revoked')
      }
    })
  })

  describe('Test 4: STAFF cannot access OWNER-only endpoints', () => {
    it('should return 403 when FRONT_DESK tries to access OWNER endpoint', () => {
      const user = getStaffByIdentifier('frontdesk')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(403)
      }
    })

    it('should return 403 when KITCHEN tries to access OWNER endpoint', () => {
      const user = getStaffByIdentifier('kitchen')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(403)
      }
    })

    it('should return 403 when MANAGER tries to access OWNER endpoint', () => {
      const user = getStaffByIdentifier('manager')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(403)
      }
    })
  })

  describe('Test 5: STAFF cannot access MANAGER+ endpoints', () => {
    it('should return 403 when FRONT_DESK tries to access MANAGER endpoint', () => {
      const user = getStaffByIdentifier('frontdesk')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['MANAGER', 'OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(403)
      }
    })

    it('should return 403 when KITCHEN tries to access MANAGER endpoint', () => {
      const user = getStaffByIdentifier('kitchen')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['MANAGER', 'OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(403)
      }
    })
  })

  describe('Test 6: MANAGER can access MANAGER+ endpoints', () => {
    it('should allow MANAGER to access MANAGER endpoint', () => {
      const user = getStaffByIdentifier('manager')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['MANAGER', 'OWNER'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.user.role).toBe('MANAGER')
      }
    })
  })

  describe('Test 7: OWNER can access OWNER-only endpoints', () => {
    it('should allow OWNER to access OWNER endpoint', () => {
      const user = getStaffByIdentifier('owner')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.user.role).toBe('OWNER')
      }
    })
  })

  describe('Test 8: Deactivated user is rejected', () => {
    it('should return 401 when deactivated user tries to access', () => {
      // Create a temp user, get token, deactivate
      createStaffUser('staff-temp', 'Temp', 'tempuser', 'FRONT_DESK', 'temp123', false)
      const user = getStaffByIdentifier('tempuser')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)

      deactivateStaffUser(user.id)

      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['FRONT_DESK'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toContain('deactivated')
      }
    })
  })

  describe('Test 9: Non-existent user is rejected', () => {
    it('should return 401 when user does not exist', () => {
      // Create a token for a non-existent user ID
      const token = createStaffToken('non-existent-id', 1, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['OWNER'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.statusCode).toBe(401)
        expect(result.message).toContain('not found')
      }
    })
  })

  describe('Test 10: All roles can access ALL_STAFF endpoints', () => {
    const ALL_STAFF: StaffRole[] = ['FRONT_DESK', 'KITCHEN', 'MANAGER', 'OWNER']

    it('should allow FRONT_DESK', () => {
      const user = getStaffByIdentifier('frontdesk')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ALL_STAFF)
      expect(result.ok).toBe(true)
    })

    it('should allow KITCHEN', () => {
      const user = getStaffByIdentifier('kitchen')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ALL_STAFF)
      expect(result.ok).toBe(true)
    })

    it('should allow MANAGER', () => {
      const user = getStaffByIdentifier('manager')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ALL_STAFF)
      expect(result.ok).toBe(true)
    })

    it('should allow OWNER', () => {
      const user = getStaffByIdentifier('owner')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)
      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ALL_STAFF)
      expect(result.ok).toBe(true)
    })
  })

  describe('Test 11: Tampered token is rejected', () => {
    it('should reject token with modified payload', () => {
      const user = getStaffByIdentifier('frontdesk')!
      const token = createStaffToken(user.id, user.tokenVersion, TEST_SECRET)

      // Tamper with the token by changing a character
      const tampered = token.slice(0, -4) + 'XXXX'
      const req = createMockReq(tampered)
      const result = authenticateAndAuthorize(req, mockEnv, ['FRONT_DESK'])
      expect(result.ok).toBe(false)
    })
  })

  describe('Test 12: Expired token is rejected', () => {
    it('should reject token with past expiry', () => {
      const user = getStaffByIdentifier('frontdesk')!
      // Create a token and manually craft an expired one
      const expiresAt = Date.now() - 1000 // 1 second in the past
      const payload = `${user.id}:${user.tokenVersion}:${expiresAt}`
      const signature = createHmac('sha256', TEST_SECRET).update(payload).digest('hex')
      const token = Buffer.from(`${payload}:${signature}`).toString('base64url')

      const req = createMockReq(token)
      const result = authenticateAndAuthorize(req, mockEnv, ['FRONT_DESK'])
      expect(result.ok).toBe(false)
    })
  })
})
