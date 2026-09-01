import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { generateQrToken, verifyQrToken, DEFAULT_QR_TOKEN_TTL_MS } from './qrToken.js'

const SECRET = 'test-secret-key'

describe('QR token', () => {
  it('generates a token that verifies back to the same roomId', () => {
    const token = generateQrToken(304, SECRET)
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(304)
    expect(result?.issuedAt).toBeTypeOf('number')
  })

  it('generates unique tokens for different rooms', () => {
    const t1 = generateQrToken(304, SECRET)
    const t2 = generateQrToken(305, SECRET)
    expect(t1).not.toBe(t2)
  })

  it('rejects a token signed with a different secret', () => {
    const token = generateQrToken(304, SECRET)
    expect(verifyQrToken(token, 'wrong-secret')).toBeUndefined()
  })

  it('rejects a tampered token', () => {
    const token = generateQrToken(304, SECRET)
    const tampered = token.slice(0, -2) + 'XX'
    expect(verifyQrToken(tampered, SECRET)).toBeUndefined()
  })

  it('rejects an empty string', () => {
    expect(verifyQrToken('', SECRET)).toBeUndefined()
  })

  it('rejects a non-base64 string', () => {
    expect(verifyQrToken('not-a-valid-token!!!', SECRET)).toBeUndefined()
  })

  it('rejects a token with valid HMAC but room ID exceeding 9999', () => {
    const badPayload = '99999'
    const hmac = createHmac('sha256', SECRET).update(badPayload).digest('hex')
    const token = Buffer.from(`${badPayload}:${hmac}`).toString('base64url')
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeUndefined()
  })

  it('round-trips roomId 1 (minimum valid)', () => {
    const token = generateQrToken(1, SECRET)
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(1)
  })

  it('round-trips roomId 9999 (maximum valid)', () => {
    const token = generateQrToken(9999, SECRET)
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(9999)
  })

  it('rejects a V2 token that has expired', () => {
    const oldTimestamp = Date.now() - DEFAULT_QR_TOKEN_TTL_MS - 1000
    const token = generateQrToken(304, SECRET, oldTimestamp)
    const result = verifyQrToken(token, SECRET, DEFAULT_QR_TOKEN_TTL_MS)
    expect(result).toBeUndefined()
  })

  it('accepts a V2 token within TTL', () => {
    const token = generateQrToken(304, SECRET)
    const result = verifyQrToken(token, SECRET, DEFAULT_QR_TOKEN_TTL_MS)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(304)
  })

  it('accepts a legacy V1 token (backward compatibility)', () => {
    // Manually create a V1 token: base64url(roomId:hmac)
    const payload = '304'
    const hmac = createHmac('sha256', SECRET).update(payload).digest('hex')
    const token = Buffer.from(`${payload}:${hmac}`).toString('base64url')
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(304)
    expect(result?.issuedAt).toBeUndefined()
  })

  it('V1 token does not expire (backward compat)', () => {
    const payload = '304'
    const hmac = createHmac('sha256', SECRET).update(payload).digest('hex')
    const token = Buffer.from(`${payload}:${hmac}`).toString('base64url')
    const result = verifyQrToken(token, SECRET, DEFAULT_QR_TOKEN_TTL_MS)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(304)
  })

  it('generates tokens with custom issuedAt', () => {
    const ts = Date.now()
    const token = generateQrToken(304, SECRET, ts)
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeDefined()
    expect(result?.issuedAt).toBe(ts)
  })
})
