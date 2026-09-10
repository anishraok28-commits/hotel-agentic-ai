/**
 * Staff session token management.
 *
 * Uses HMAC-SHA256 for token signing. Tokens contain
 * userId:tokenVersion:expiresAt:signature.
 *
 * Token version allows server-side revocation without a session store:
 * when a user's token_version changes in the DB, old tokens are rejected.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

const TOKEN_EXPIRY_HOURS = 12

export interface TokenPayload {
  readonly userId: string
  readonly tokenVersion: number
  readonly expiresAt: number
}

/** Create a signed session token for a staff user. */
export function createStaffToken(
  userId: string,
  tokenVersion: number,
  secret: string,
  expiryHours = TOKEN_EXPIRY_HOURS,
): string {
  const expiresAt = Date.now() + expiryHours * 60 * 60 * 1000
  const payload = `${userId}:${tokenVersion}:${expiresAt}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${signature}`).toString('base64url')
}

/** Verify and decode a staff token. Returns null if invalid/expired/revoked. */
export function verifyStaffToken(
  token: string,
  secret: string,
): TokenPayload | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const parts = decoded.split(':')
    if (parts.length !== 4) return null

    const [userId, tokenVersionStr, expiresAtStr, providedSignature] = parts
    const tokenVersion = Number(tokenVersionStr)
    const expiresAt = Number(expiresAtStr)
    if (!userId || Number.isNaN(tokenVersion) || Number.isNaN(expiresAt)) return null

    // Check expiry
    if (Date.now() > expiresAt) return null

    // Verify signature
    const payload = `${userId}:${tokenVersionStr}:${expiresAtStr}`
    const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex')

    if (providedSignature.length !== expectedSignature.length) return null
    const valid = timingSafeEqual(
      Buffer.from(providedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    )

    if (!valid) return null

    return { userId, tokenVersion, expiresAt }
  } catch {
    return null
  }
}
