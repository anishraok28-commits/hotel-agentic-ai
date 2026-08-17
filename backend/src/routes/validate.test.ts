import { describe, it, expect } from 'vitest'
import {
  validateConciergePayload,
  validateRoomServicePayload,
  validateLateCheckoutPayload,
} from './validate.js'

describe('validateConciergePayload', () => {
  const validPayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    request: 'Restaurant recommendations',
    mode: 'AI_CONCIERGE',
  }

  it('accepts a valid payload', () => {
    expect(validateConciergePayload(validPayload).ok).toBe(true)
  })

  it('rejects null', () => {
    expect(validateConciergePayload(null).ok).toBe(false)
  })

  it('rejects missing guestId', () => {
    const { guestId: _, ...rest } = validPayload
    void _
    expect(validateConciergePayload(rest).ok).toBe(false)
  })

  it('rejects missing sessionId', () => {
    const { sessionId: _, ...rest } = validPayload
    void _
    expect(validateConciergePayload(rest).ok).toBe(false)
  })

  it('rejects non-integer roomNumber', () => {
    expect(validateConciergePayload({ ...validPayload, roomNumber: 1.5 }).ok).toBe(false)
  })

  it('rejects roomNumber < 1', () => {
    expect(validateConciergePayload({ ...validPayload, roomNumber: 0 }).ok).toBe(false)
  })

  it('rejects empty request', () => {
    expect(validateConciergePayload({ ...validPayload, request: '' }).ok).toBe(false)
  })

  it('rejects request > 2000 chars', () => {
    expect(validateConciergePayload({ ...validPayload, request: 'x'.repeat(2001) }).ok).toBe(false)
  })

  it('rejects wrong mode', () => {
    expect(validateConciergePayload({ ...validPayload, mode: 'WRONG' }).ok).toBe(false)
  })
})

describe('validateRoomServicePayload', () => {
  const validPayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    items: [{ itemId: 'menu.001', name: 'Sandwich', quantity: 1, unitPrice: 1200 }],
    mode: 'QR_ROOM_SERVICE',
  }

  it('accepts a valid payload', () => {
    expect(validateRoomServicePayload(validPayload).ok).toBe(true)
  })

  it('rejects empty items', () => {
    expect(validateRoomServicePayload({ ...validPayload, items: [] }).ok).toBe(false)
  })

  it('rejects > 50 items', () => {
    const items = Array.from({ length: 51 }, () => validPayload.items[0])
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects notes > 500 chars', () => {
    expect(validateRoomServicePayload({ ...validPayload, notes: 'x'.repeat(501) }).ok).toBe(false)
  })

  it('rejects wrong mode', () => {
    expect(validateRoomServicePayload({ ...validPayload, mode: 'WRONG' }).ok).toBe(false)
  })
})

describe('validateLateCheckoutPayload', () => {
  const validPayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    requestedTime: '2026-08-11T14:00:00Z',
    mode: 'LATE_CHECKOUT',
  }

  it('accepts a valid payload', () => {
    expect(validateLateCheckoutPayload(validPayload).ok).toBe(true)
  })

  it('rejects missing requestedTime', () => {
    const { requestedTime: _, ...rest } = validPayload
    void _
    expect(validateLateCheckoutPayload(rest).ok).toBe(false)
  })

  it('rejects wrong mode', () => {
    expect(validateLateCheckoutPayload({ ...validPayload, mode: 'WRONG' }).ok).toBe(false)
  })
})
