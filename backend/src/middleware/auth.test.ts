import { describe, it, expect } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { isAuthorized } from './auth.js'
import type { EnvConfig } from '../config/env.js'

const env: EnvConfig = {
  port: 3000,
  nodeEnv: 'local',
  serviceToken: 'correct-token',
  rateLimitWindowSeconds: 60,
  rateLimitMax: 30,
  allowedOrigins: ['http://localhost:5173'],
  makeBookingWebhookUrl: 'https://hook.make.com/bk',
  makeRoomServiceWebhookUrl: 'https://hook.make.com/rs',
  makeLateCheckoutWebhookUrl: 'https://hook.make.com/lc',
}

function requestWithHeader(header: string | undefined): IncomingMessage {
  return { headers: header ? { authorization: header } : {} } as IncomingMessage
}

describe('isAuthorized', () => {
  it('accepts the correct Bearer token', () => {
    expect(isAuthorized(requestWithHeader('Bearer correct-token'), env)).toBe(true)
  })

  it('rejects a missing Authorization header', () => {
    expect(isAuthorized(requestWithHeader(undefined), env)).toBe(false)
  })

  it('rejects a wrong token', () => {
    expect(isAuthorized(requestWithHeader('Bearer wrong-token'), env)).toBe(false)
  })

  it('rejects a non-Bearer scheme', () => {
    expect(isAuthorized(requestWithHeader('Basic abc123'), env)).toBe(false)
  })

  it('rejects a Bearer header without a token', () => {
    expect(isAuthorized(requestWithHeader('Bearer'), env)).toBe(false)
  })

  it('rejects an empty token value', () => {
    expect(isAuthorized(requestWithHeader('Bearer '), env)).toBe(false)
  })

  it('does not leak token equality via length-based rejection', () => {
    // Both wrong tokens (short and long) must be rejected identically.
    expect(isAuthorized(requestWithHeader('Bearer short'), env)).toBe(false)
    expect(
      isAuthorized(requestWithHeader('Bearer a-very-long-wrong-token-value'), env),
    ).toBe(false)
  })
})