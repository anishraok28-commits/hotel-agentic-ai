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
  })

  it('throws clear error when MAKE_BOOKING_WEBHOOK_URL is missing', () => {
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_BOOKING_WEBHOOK_URL')
  })

  it('throws clear error when MAKE_ROOM_SERVICE_WEBHOOK_URL is missing', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_ROOM_SERVICE_WEBHOOK_URL')
  })

  it('throws clear error when MAKE_LATE_CHECKOUT_WEBHOOK_URL is missing', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_LATE_CHECKOUT_WEBHOOK_URL')
  })

  it('throws clear error when all three are missing', () => {
    expect(() => loadEnv()).toThrow('Missing required environment variable: MAKE_BOOKING_WEBHOOK_URL')
  })

  it('loads successfully when all required variables are set', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'

    const config = loadEnv()
    expect(config.makeBookingWebhookUrl).toBe('https://hook.make.com/bk')
    expect(config.makeRoomServiceWebhookUrl).toBe('https://hook.make.com/rs')
    expect(config.makeLateCheckoutWebhookUrl).toBe('https://hook.make.com/lc')
  })

  it('defaults port to 3000', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'

    const config = loadEnv()
    expect(config.port).toBe(3000)
  })

  it('reads PORT from environment', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'
    process.env.PORT = '8080'

    const config = loadEnv()
    expect(config.port).toBe(8080)
  })

  it('defaults nodeEnv to local', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'

    const config = loadEnv()
    expect(config.nodeEnv).toBe('local')
  })

  it('reads ENV from environment', () => {
    process.env.MAKE_BOOKING_WEBHOOK_URL = 'https://hook.make.com/bk'
    process.env.MAKE_ROOM_SERVICE_WEBHOOK_URL = 'https://hook.make.com/rs'
    process.env.MAKE_LATE_CHECKOUT_WEBHOOK_URL = 'https://hook.make.com/lc'
    process.env.ENV = 'production'

    const config = loadEnv()
    expect(config.nodeEnv).toBe('production')
  })

  it('error message mentions docs', () => {
    try {
      loadEnv()
    } catch (err) {
      expect((err as Error).message).toContain('docs/api-contract.md')
    }
  })
})
