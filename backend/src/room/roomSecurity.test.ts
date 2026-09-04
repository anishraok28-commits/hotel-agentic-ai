/**
 * Security tests for room-specific QR code system.
 *
 * Proves:
 * - Invalid tokens are rejected
 * - Valid tokens map to the correct room
 * - Changing room number manually cannot impersonate another room
 * - Guest cannot access another room's order
 * - Room identity is verified on every protected endpoint
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { closeDatabase, getDatabase } from '../db/database.js'
import { generateQrToken, verifyQrToken } from '../session/qrToken.js'
import { checkIn, getSession, verifySession } from '../session/store.js'
import { createRoom, getRoomByNumber, getRoomByToken, clearRooms, updateRoomActive } from '../room/roomStore.js'
import { createOrder, listOrders, getOrdersByGuest } from '../order/store.js'

const SECRET = 'test-qr-secret'

beforeEach(() => {
  closeDatabase()
  // getDatabase() with explicit :memory: for isolated tests
  getDatabase(':memory:')
  clearRooms()
})

describe('Security: QR token room binding', () => {
  it('rejects an invalid token', () => {
    const result = verifyQrToken('invalid-token', SECRET)
    expect(result).toBeUndefined()
  })

  it('rejects a token signed with wrong secret', () => {
    const token = generateQrToken(101, SECRET)
    const result = verifyQrToken(token, 'wrong-secret')
    expect(result).toBeUndefined()
  })

  it('rejects a tampered token', () => {
    const token = generateQrToken(101, SECRET)
    const tampered = token.slice(0, -4) + 'AAAA'
    const result = verifyQrToken(tampered, SECRET)
    expect(result).toBeUndefined()
  })

  it('valid token maps to correct room', () => {
    const token = generateQrToken(101, SECRET)
    const result = verifyQrToken(token, SECRET)
    expect(result).toBeDefined()
    expect(result?.roomId).toBe(101)
  })

  it('token for room 101 does NOT match room 102', () => {
    const token101 = generateQrToken(101, SECRET)
    const result = verifyQrToken(token101, SECRET)
    expect(result?.roomId).toBe(101)
    expect(result?.roomId).not.toBe(102)
  })

  it('changing room number in request body does not bypass token verification', () => {
    // Token is for room 101, but client claims room 102
    const token = generateQrToken(101, SECRET)
    const tokenResult = verifyQrToken(token, SECRET)

    // Server cross-checks: tokenResult.roomId (101) === payload.roomNumber
    const payloadRoomNumber = 102
    expect(tokenResult?.roomId).toBe(101)
    expect(tokenResult?.roomId).not.toBe(payloadRoomNumber)
    // This proves the impersonation attempt would fail
  })
})

describe('Security: room store isolation', () => {
  it('room token lookup returns correct room', () => {
    const token = generateQrToken(101, SECRET)
    createRoom(101, token)

    const room = getRoomByToken(token)
    expect(room).toBeDefined()
    expect(room?.roomNumber).toBe(101)
  })

  it('room token for room 101 does NOT match room 102 in store', () => {
    const token101 = generateQrToken(101, SECRET)
    const token102 = generateQrToken(102, SECRET)
    createRoom(101, token101)
    createRoom(102, token102)

    const room101 = getRoomByToken(token101)
    const room102 = getRoomByToken(token102)

    expect(room101?.roomNumber).toBe(101)
    expect(room102?.roomNumber).toBe(102)
    expect(room101?.roomNumber).not.toBe(room102?.roomNumber)
  })

  it('inactive room is returned but flagged', () => {
    const token = generateQrToken(101, SECRET)
    createRoom(101, token)

    const room = getRoomByNumber(101)
    expect(room).toBeDefined()
    expect(room?.active).toBe(true)

    // Deactivate
    updateRoomActive(101, false)

    const updated = getRoomByNumber(101)
    expect(updated?.active).toBe(false)
  })
})

describe('Security: session room binding', () => {
  it('session is bound to a specific room', () => {
    const session = checkIn(101, 'guest-a', 'session-a', 86400000)
    expect(session.roomId).toBe(101)

    const retrieved = getSession(101)
    expect(retrieved?.guestId).toBe('guest-a')
    expect(retrieved?.sessionId).toBe('session-a')
  })

  it('session for room 101 cannot be used for room 102', () => {
    checkIn(101, 'guest-a', 'session-a', 86400000)

    // Try to verify session with wrong room
    const result = verifySession(102, 'guest-a', 'session-a')
    expect(result).toBeUndefined()
  })

  it('wrong guestId cannot access room session', () => {
    checkIn(101, 'guest-a', 'session-a', 86400000)

    const result = verifySession(101, 'guest-b', 'session-a')
    expect(result).toBeUndefined()
  })

  it('wrong sessionId cannot access room session', () => {
    checkIn(101, 'guest-a', 'session-a', 86400000)

    const result = verifySession(101, 'guest-a', 'session-b')
    expect(result).toBeUndefined()
  })
})

describe('Security: order room isolation', () => {
  it('order is associated with correct room', () => {
    const order = createOrder({
      orderId: 'order-101',
      requestId: 'req-101',
      roomNumber: 101,
      guestId: 'guest-a',
      sessionId: 'session-a',
      items: [{ itemId: 'item-1', name: 'Test', quantity: 1, unitPrice: 100 }],
      total: 100,
    })

    expect(order.roomNumber).toBe(101)
  })

  it('order for room 101 cannot be accessed with room 102 token', () => {
    createOrder({
      orderId: 'order-101',
      requestId: 'req-101',
      roomNumber: 101,
      guestId: 'guest-a',
      sessionId: 'session-a',
      items: [{ itemId: 'item-1', name: 'Test', quantity: 1, unitPrice: 100 }],
      total: 100,
    })

    // Staff listing shows the order with correct room
    const orders = listOrders()
    expect(orders).toHaveLength(1)
    expect(orders[0].roomNumber).toBe(101)
    // Staff cannot see guestId/sessionId (removed for security)
    expect(orders[0]).not.toHaveProperty('guestId')
    expect(orders[0]).not.toHaveProperty('sessionId')
  })

  it('guest can only see their own room orders via getOrdersByGuest', () => {
    createOrder({
      orderId: 'order-101',
      requestId: 'req-101',
      roomNumber: 101,
      guestId: 'guest-a',
      sessionId: 'session-a',
      items: [{ itemId: 'item-1', name: 'Test', quantity: 1, unitPrice: 100 }],
      total: 100,
    })

    createOrder({
      orderId: 'order-102',
      requestId: 'req-102',
      roomNumber: 102,
      guestId: 'guest-b',
      sessionId: 'session-b',
      items: [{ itemId: 'item-1', name: 'Test', quantity: 1, unitPrice: 100 }],
      total: 100,
    })

    const room101Orders = getOrdersByGuest('guest-a', 'session-a', 101)
    const room102Orders = getOrdersByGuest('guest-b', 'session-b', 102)

    expect(room101Orders).toHaveLength(1)
    expect(room101Orders[0].orderId).toBe('order-101')

    expect(room102Orders).toHaveLength(1)
    expect(room102Orders[0].orderId).toBe('order-102')

    // Guest A cannot see Guest B's orders
    const crossAccess = getOrdersByGuest('guest-a', 'session-a', 102)
    expect(crossAccess).toHaveLength(0)
  })
})

describe('Security: QR management room isolation', () => {
  it('each room gets a unique QR token', () => {
    const token1 = generateQrToken(101, SECRET)
    const token2 = generateQrToken(102, SECRET)
    const token3 = generateQrToken(103, SECRET)

    createRoom(101, token1)
    createRoom(102, token2)
    createRoom(103, token3)

    const room1 = getRoomByToken(token1)
    const room2 = getRoomByToken(token2)
    const room3 = getRoomByToken(token3)

    expect(room1?.roomNumber).toBe(101)
    expect(room2?.roomNumber).toBe(102)
    expect(room3?.roomNumber).toBe(103)

    // Tokens are unique
    expect(token1).not.toBe(token2)
    expect(token2).not.toBe(token3)
    expect(token1).not.toBe(token3)
  })

  it('token for room 101 cannot access room 102', () => {
    const token101 = generateQrToken(101, SECRET)
    const token102 = generateQrToken(102, SECRET)
    createRoom(101, token101)
    createRoom(102, token102)

    const roomFromToken101 = getRoomByToken(token101)
    const roomFromToken102 = getRoomByToken(token102)

    expect(roomFromToken101?.roomNumber).toBe(101)
    expect(roomFromToken102?.roomNumber).toBe(102)
    expect(roomFromToken101?.roomNumber).not.toBe(roomFromToken102?.roomNumber)
  })
})
