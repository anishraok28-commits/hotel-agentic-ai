import { describe, it, expect } from 'vitest'
import { MODE_ORDER, MODES, ROUTABLE_MODES, isFrontendMode } from './modeRegistry'
import { ROUTE_BY_MODE } from '@/api/apiContract'

describe('mode registry', () => {
  it('defines exactly four modes', () => {
    expect(MODE_ORDER).toHaveLength(4)
  })

  it('contains the four documented modes', () => {
    expect(MODE_ORDER).toEqual([
      'AI_CONCIERGE',
      'QR_ROOM_SERVICE',
      'LATE_CHECKOUT',
      '3_IN_1_UNIFIED',
    ])
  })

  it('exposes routable modes that exclude 3_IN_1_UNIFIED', () => {
    expect(ROUTABLE_MODES.map((m) => m.id)).toEqual([
      'AI_CONCIERGE',
      'QR_ROOM_SERVICE',
      'LATE_CHECKOUT',
    ])
  })

  it('maps each routable mode to exactly one future API route', () => {
    expect(ROUTE_BY_MODE.AI_CONCIERGE).toBe('POST /api/concierge')
    expect(ROUTE_BY_MODE.QR_ROOM_SERVICE).toBe('POST /api/room-service')
    expect(ROUTE_BY_MODE.LATE_CHECKOUT).toBe('POST /api/late-checkout')
  })

  it('3_IN_1_UNIFIED has NO future API route (no fourth endpoint)', () => {
    expect(ROUTE_BY_MODE['3_IN_1_UNIFIED']).toBeNull()
  })

  it('validates mode ids', () => {
    expect(isFrontendMode('AI_CONCIERGE')).toBe(true)
    expect(isFrontendMode('NOT_A_MODE')).toBe(false)
  })

  it('uses consistent display titles', () => {
    expect(MODES.AI_CONCIERGE.title).toBe('AI Concierge')
    expect(MODES.QR_ROOM_SERVICE.title).toBe('QR Room Service')
    expect(MODES.LATE_CHECKOUT.title).toBe('Late Checkout')
    expect(MODES['3_IN_1_UNIFIED'].title).toBe('Guest Services')
  })
})