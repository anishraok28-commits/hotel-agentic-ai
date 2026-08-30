/**
 * Room-specific QR token generation and verification.
 *
 * A QR token encodes: roomId + HMAC signature.
 * Format: base64url(roomId:hex-hmac-sha256(roomId, secret))
 *
 * This ensures:
 * - Each room gets a unique token
 * - Tokens cannot be forged without the secret
 * - Room 304's token cannot be used for Room 305
 * - Tokens can be verified without a database lookup
 *
 * The QR token alone is NOT sufficient for authorization — it must be
 * combined with an active guest session (see session/store.ts).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

function base64urlEncode(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8')
}

/**
 * Generate a QR token for a specific room.
 * The token embeds the roomId and a MAC so it can be verified later
 * without a database lookup.
 */
export function generateQrToken(roomId: number, secret: string): string {
  const payload = String(roomId)
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return base64urlEncode(`${payload}:${hmac}`)
}

/**
 * Verify a QR token and return the encoded roomId if valid.
 * Returns undefined when the token is malformed, tampered, or missing.
 */
export function verifyQrToken(token: string, secret: string): number | undefined {
  try {
    const decoded = base64urlDecode(token)
    const sep = decoded.lastIndexOf(':')
    if (sep === -1) return undefined

    const payload = decoded.slice(0, sep)
    const hmac = decoded.slice(sep + 1)

    const roomId = Number(payload)
    if (!Number.isInteger(roomId) || roomId < 1 || roomId > 9999) return undefined

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    if (hmac.length !== expected.length) return undefined
    if (!timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return undefined

    return roomId
  } catch {
    return undefined
  }
}
