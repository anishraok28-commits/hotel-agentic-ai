import { describe, it, expect } from 'vitest'
import { createRateLimiter } from './rateLimit.js'

describe('createRateLimiter', () => {
  it('allows up to max requests within a window', () => {
    const limiter = createRateLimiter(60, 3)
    expect(limiter.consume('ip-1', 0)).toBe(true)
    expect(limiter.consume('ip-1', 1000)).toBe(true)
    expect(limiter.consume('ip-1', 2000)).toBe(true)
    expect(limiter.consume('ip-1', 3000)).toBe(false)
  })

  it('tracks each client independently', () => {
    const limiter = createRateLimiter(60, 1)
    expect(limiter.consume('ip-a', 0)).toBe(true)
    expect(limiter.consume('ip-a', 0)).toBe(false)
    expect(limiter.consume('ip-b', 0)).toBe(true)
  })

  it('refills the budget after the window elapses', () => {
    const limiter = createRateLimiter(60, 1)
    expect(limiter.consume('ip-1', 0)).toBe(true)
    expect(limiter.consume('ip-1', 1000)).toBe(false)
    expect(limiter.consume('ip-1', 60_001)).toBe(true)
  })

  it('resets the budget at the window boundary', () => {
    const limiter = createRateLimiter(60, 2)
    expect(limiter.consume('ip-1', 0)).toBe(true)
    expect(limiter.consume('ip-1', 59_999)).toBe(true)
    expect(limiter.consume('ip-1', 59_999)).toBe(false)
    expect(limiter.consume('ip-1', 60_000)).toBe(true)
  })
})