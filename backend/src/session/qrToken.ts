/**
 * Room-specific QR token generation and verification.
 *
 * Two token formats are supported:
 *
 * V2 (current): base64url(roomId|timestamp|hex-hmac-sha256(roomId|timestamp, secret))
 *   - Includes an issuance timestamp so tokens can expire independently.
 *   - Default TTL: 24 hours (configurable via qrTokenTtlMs).
 *
 * V1 (legacy):  base64url(roomId:hex-hmac-sha256(roomId, secret))
 *   - No timestamp; verified for backward compatibility with existing QR codes.
 *   - Still cryptographically bound to the room.
 *
 * The QR token alone is NOT sufficient for authorization — it must be
 * combined with an active guest session (see session/store.ts).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Default QR token lifetime: 24 hours. */
export const DEFAULT_QR_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function base64urlEncode(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function base64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf-8')
}

/**
 * Generate a V2 QR token for a specific room.
 * Embeds roomId + issuance timestamp + HMAC so the token can expire
 * independently of the session.
 */
export function generateQrToken(
  roomId: number,
  secret: string,
  issuedAt: number = Date.now(),
): string {
  const payload = `${roomId}|${issuedAt}`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')
  return base64urlEncode(`${payload}|${hmac}`)
}

export interface QrTokenResult {
  readonly roomId: number
  readonly issuedAt: number | undefined
}

/**
 * Verify a QR token and return the roomId if valid.
 *
 * Returns undefined when the token is:
 * - Malformed or not base64url
 * - Tampered (HMAC mismatch)
 * - Contains an invalid roomId (not 1–9999)
 * - Expired (V2 tokens only, when ttlMs is provided)
 */
export function verifyQrToken(
  token: string,
  secret: string,
  ttlMs: number = DEFAULT_QR_TOKEN_TTL_MS,
): QrTokenResult | undefined {
  try {
    const decoded = base64urlDecode(token)

    // Try V2 format: roomId|timestamp|hmac
    const pipeSep = decoded.lastIndexOf('|')
    if (pipeSep !== -1) {
      const beforeHmac = decoded.slice(0, pipeSep)
      const hmac = decoded.slice(pipeSep + 1)
      const tsSep = beforeHmac.lastIndexOf('|')
      if (tsSep !== -1) {
        const roomIdStr = beforeHmac.slice(0, tsSep)
        const timestampStr = beforeHmac.slice(tsSep + 1)
        const roomId = Number(roomIdStr)
        const issuedAt = Number(timestampStr)

        if (
          Number.isInteger(roomId) && roomId >= 1 && roomId <= 9999 &&
          Number.isFinite(issuedAt) && issuedAt > 0
        ) {
          const payload = `${roomId}|${issuedAt}`
          const expected = createHmac('sha256', secret).update(payload).digest('hex')
          if (hmac.length === expected.length &&
              timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
            // Check expiration for V2 tokens
            if (ttlMs > 0 && Date.now() - issuedAt > ttlMs) {
              return undefined
            }
            return { roomId, issuedAt }
          }
        }
      }
    }

    // Try V1 format (legacy): roomId:hmac
    const colonSep = decoded.lastIndexOf(':')
    if (colonSep !== -1) {
      const payload = decoded.slice(0, colonSep)
      const hmac = decoded.slice(colonSep + 1)
      const roomId = Number(payload)
      if (Number.isInteger(roomId) && roomId >= 1 && roomId <= 9999) {
        const expected = createHmac('sha256', secret).update(payload).digest('hex')
        if (hmac.length === expected.length &&
            timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) {
          // Legacy tokens have no timestamp; treat as non-expiring for backward compat
          return { roomId, issuedAt: undefined }
        }
      }
    }

    return undefined
  } catch {
    return undefined
  }
}
