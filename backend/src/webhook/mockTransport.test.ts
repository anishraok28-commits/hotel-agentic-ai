import { describe, it, expect } from 'vitest'
import { createMockTransport } from './mockTransport.js'

describe('mock transport', () => {
  it('returns accepted response for any workflow', async () => {
    const transport = createMockTransport()
    const response = await transport.send('BOOKING', {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 100,
      mode: 'AI_CONCIERGE',
    })

    expect(response.status).toBe('accepted')
    expect(response.requestId).toMatch(/^mock-/)
    expect(response.message).toContain('mock-accepted')
  })

  it('generates unique requestIds', async () => {
    const transport = createMockTransport()
    const r1 = await transport.send('ROOM_SERVICE', {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 100,
      mode: 'QR_ROOM_SERVICE',
    })
    const r2 = await transport.send('LATE_CHECKOUT', {
      guestId: 'guest-1',
      sessionId: 'session-1',
      roomNumber: 100,
      mode: 'LATE_CHECKOUT',
    })

    expect(r1.requestId).not.toBe(r2.requestId)
  })
})
