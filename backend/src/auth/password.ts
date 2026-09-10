/**
 * Password hashing using Node.js crypto (scrypt).
 * No external dependencies required.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SALT_LENGTH = 32
const KEY_LENGTH = 64

/** Hash a password with a random salt. Returns "salt:hash" hex string. */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH)
  const key = scryptSync(password, salt, KEY_LENGTH)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

/** Verify a password against a stored "salt:hash" string. Constant-time comparison. */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false

  const salt = Buffer.from(saltHex, 'hex')
  const expectedHash = Buffer.from(hashHex, 'hex')
  const actualKey = scryptSync(password, salt, KEY_LENGTH)

  if (actualKey.length !== expectedHash.length) return false
  return timingSafeEqual(actualKey, expectedHash)
}
