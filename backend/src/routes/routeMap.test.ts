import { describe, it, expect } from 'vitest'
import { WORKFLOW_BY_MODE } from './routeMap.js'

describe('route map', () => {
  it('maps AI_CONCIERGE to BOOKING', () => {
    expect(WORKFLOW_BY_MODE.AI_CONCIERGE).toBe('BOOKING')
  })

  it('maps QR_ROOM_SERVICE to ROOM_SERVICE', () => {
    expect(WORKFLOW_BY_MODE.QR_ROOM_SERVICE).toBe('ROOM_SERVICE')
  })

  it('maps LATE_CHECKOUT to LATE_CHECKOUT', () => {
    expect(WORKFLOW_BY_MODE.LATE_CHECKOUT).toBe('LATE_CHECKOUT')
  })

  it('has exactly three modes', () => {
    expect(Object.keys(WORKFLOW_BY_MODE)).toHaveLength(3)
  })
})
