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

  it('rejects roomNumber > 9999', () => {
    expect(validateConciergePayload({ ...validPayload, roomNumber: 10000 }).ok).toBe(false)
  })

  it('rejects empty request', () => {
    expect(validateConciergePayload({ ...validPayload, request: '' }).ok).toBe(false)
  })

  it('rejects whitespace-only request', () => {
    expect(validateConciergePayload({ ...validPayload, request: '   ' }).ok).toBe(false)
  })

  it('rejects whitespace-only guestId', () => {
    expect(validateConciergePayload({ ...validPayload, guestId: '\t ' }).ok).toBe(false)
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

  it('rejects roomNumber > 9999', () => {
    expect(validateRoomServicePayload({ ...validPayload, roomNumber: 10000 }).ok).toBe(false)
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

  it('rejects an unknown itemId', () => {
    const items = [{ ...validPayload.items[0], itemId: 'menu.999' }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a missing itemId', () => {
    const items = [{ ...validPayload.items[0], itemId: undefined }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects an empty item name', () => {
    const items = [{ ...validPayload.items[0], name: '' }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a whitespace-only item name', () => {
    const items = [{ ...validPayload.items[0], name: '   ' }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a non-string item name', () => {
    const items = [{ ...validPayload.items[0], name: 123 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a non-integer quantity', () => {
    const items = [{ ...validPayload.items[0], quantity: 1.5 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects quantity below 1', () => {
    const items = [{ ...validPayload.items[0], quantity: 0 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a negative quantity', () => {
    const items = [{ ...validPayload.items[0], quantity: -2 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects quantity above 99', () => {
    const items = [{ ...validPayload.items[0], quantity: 100 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a non-positive unitPrice', () => {
    const items = [{ ...validPayload.items[0], unitPrice: 0 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a negative unitPrice', () => {
    const items = [{ ...validPayload.items[0], unitPrice: -100 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('rejects a non-integer unitPrice', () => {
    const items = [{ ...validPayload.items[0], unitPrice: 12.5 }]
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('returns catalog-sanitized items that override forged names and prices', () => {
    const items = [
      {
        itemId: 'menu.001',
        name: 'Forged Name',
        quantity: 2,
        unitPrice: 1,
      },
    ]
    const result = validateRoomServicePayload({ ...validPayload, items })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.items).toEqual([
        { itemId: 'menu.001', name: 'Club Sandwich', quantity: 2, unitPrice: 1200 },
      ])
    }
  })

  it('rejects an item that is not an object', () => {
    const items = ['not-an-object']
    expect(validateRoomServicePayload({ ...validPayload, items }).ok).toBe(false)
  })

  it('reports the offending item index on invalid quantity', () => {
    const items = [
      validPayload.items[0],
      { ...validPayload.items[0], quantity: 0 },
    ]
    const result = validateRoomServicePayload({ ...validPayload, items })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'items[1].quantity')).toBe(true)
    }
  })
})

describe('validateLateCheckoutPayload', () => {
  const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const validPayload = {
    guestId: 'guest-123',
    sessionId: 'session-456',
    roomNumber: 214,
    requestedTime: futureTime,
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

  it('rejects whitespace-only guestId', () => {
    expect(validateLateCheckoutPayload({ ...validPayload, guestId: '   ' }).ok).toBe(false)
  })

  it('rejects roomNumber > 9999', () => {
    expect(validateLateCheckoutPayload({ ...validPayload, roomNumber: 10000 }).ok).toBe(false)
  })

  it('rejects a requestedTime in the past', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    expect(validateLateCheckoutPayload({ ...validPayload, requestedTime: past }).ok).toBe(false)
  })

  it('rejects a non-ISO requestedTime string', () => {
    expect(
      validateLateCheckoutPayload({ ...validPayload, requestedTime: 'tomorrow at noon' }).ok,
    ).toBe(false)
  })

  it('rejects a non-UTC timestamp', () => {
    expect(
      validateLateCheckoutPayload({ ...validPayload, requestedTime: '2026-08-11T14:00:00+05:30' })
        .ok,
    ).toBe(false)
  })

  it('rejects a non-string requestedTime', () => {
    expect(validateLateCheckoutPayload({ ...validPayload, requestedTime: 12345 }).ok).toBe(false)
  })

  it('rejects wrong mode', () => {
    expect(validateLateCheckoutPayload({ ...validPayload, mode: 'WRONG' }).ok).toBe(false)
  })
})
