import { describe, it, expect, beforeEach } from 'vitest'
import { loadEnv } from '../config/env.js'

describe('env config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.MAKE_BOOKING_WEBHOOK_URL
    delete process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL
    delete process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL
    delete process.env.PORT
    delete process.env.ENV
    delete process.env.SERVICE_TOKEN
    delete process.env.RATE_LIMIT_WINDOW
    delete process.env.RATE_LIMIT_MAX
  })

  function setRequired() {
    process.env.SERVICE_TOKEN = 'test-secret'
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'
  }

  it('throws clear error when MAKE_BOOKING_WEBHOOK_URL is missing', () => {
    setRequired()
    delete process.env.MAKE_BOOKING_WEBHOOK_URL
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_BOOKING_WEBHOOK_URL')
  })

  it('throws clear error when MAKE_ROOM_SERVICE_WEBHOOK_URL is missing', () => {
    setRequired()
    delete process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_ROOM_SERVICE_WEBHOOK_URL')
  })

  it('throws clear error when MAKE_LATE_CHECKOUT_WEBHOOK_URL is missing', () => {
    setRequired()
    delete process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_LATE_CHECKOUT_WEBHOOK_URL')
  })

  it('throws clear error when SERVICE_TOKEN is missing', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'
    expect(() => loadEnv()).toThrow('Missing required environment variable: SERVICE_TOKEN')
  })

  it('throws clear error when all required variables are missing', () => {
    expect(() => loadEnv()).toThrow('Missing required environment variable: SERVICE_TOKEN')
  })

  it('loads successfully when all required variables are set', () => {
    setRequired()

    const config = loadEnv()
    expect(config.serviceToken).toBe('test-secret')
    expect(config.makeBookingWebhookUrl).toBe('https://hook.make.com/bk')
    expect(config.makeRoomServiceWebhookUrl).toBe('https://hook.make.com/rs')
    expect(config.makeLateCheckoutWebhookUrl).toBe('https://hook.make.com/lc')
  })

  it('defaults port to 3000', () => {
    setRequired()

    const config = loadEnv()
    expect(config.port).toBe(3000)
  })

  it('reads PORT from environment', () => {
    setRequired()
    process.env.PORT = '8080'

    const config = loadEnv()
    expect(config.port).toBe(8080)
  })

  it('defaults nodeEnv to local', () => {
    setRequired()

    const config = loadEnv()
    expect(config.nodeEnv).toBe('local')
  })

  it('reads ENV from environment', () => {
    setRequired()
    process.env.ENV = 'production'

    const config = loadEnv()
    expect(config.nodeEnv).toBe('production')
  })

  it('defaults rate limit window to 60s and max to 30', () => {
    setRequired()

    const config = loadEnv()
    expect(config.rateLimitWindowSeconds).toBe(60)
    expect(config.rateLimitMax).toBe(30)
  })

  it('reads RATE_LIMIT_WINDOW and RATE_LIMIT_MAX from environment', () => {
    setRequired()
    process.env.RATE_LIMIT_WINDOW = '30'
    process.env.RATE_LIMIT_MAX = '5'

    const config = loadEnv()
    expect(config.rateLimitWindowSeconds).toBe(30)
    expect(config.rateLimitMax).toBe(5)
  })

  it('ignores invalid rate limit values and falls back to defaults', () => {
    setRequired()
    process.env.RATE_LIMIT_WINDOW = 'abc'
    process.env.RATE_LIMIT_MAX = '-3'

    const config = loadEnv()
    expect(config.rateLimitWindowSeconds).toBe(60)
    expect(config.rateLimitMax).toBe(30)
  })

  it('error message mentions docs', () => {
    try {
      loadEnv()
    } catch (err) {
      expect((err as Error).message).toContain('docs/api-contract.md')
    }
  })
})
