import { describe, it, expect, beforeEach } from 'vitest'
import { closeDatabase, getDatabase } from '../db/database.js'
import {
  createOrder,
  getOrder,
  getOrdersByGuest,
  updateOrderStatus,
  validateTransition,
  listOrders,
  clearOrders,
} from './store.js'

const SAMPLE_ITEMS = [
  { itemId: 'menu.001', name: 'Club Sandwich', quantity: 1, unitPrice: 1200 },
  { itemId: 'menu.010', name: 'Fresh Orange Juice', quantity: 2, unitPrice: 600 },
]

beforeEach(() => {
  closeDatabase()
  getDatabase(':memory:')
  clearOrders()
})

describe('order store', () => {
  describe('createOrder', () => {
    it('creates an order with status NEW', () => {
      const order = createOrder({
        orderId: 'order-1',
        requestId: 'req-1',
        roomNumber: 304,
        guestId: 'guest-1',
        sessionId: 'session-1',
        items: SAMPLE_ITEMS,
        total: 2400,
        notes: 'no onions',
      })
      expect(order.status).toBe('NEW')
      expect(order.orderId).toBe('order-1')
      expect(order.roomNumber).toBe(304)
      expect(order.total).toBe(2400)
      expect(order.notes).toBe('no onions')
    })

    it('stores the order retrievable by getOrder', () => {
      createOrder({
        orderId: 'order-2',
        requestId: 'req-2',
        roomNumber: 101,
        guestId: 'guest-2',
        sessionId: 'session-2',
        items: [SAMPLE_ITEMS[0]],
        total: 1200,
        notes: undefined,
      })
      const found = getOrder('order-2')
      expect(found).toBeDefined()
      expect(found?.orderId).toBe('order-2')
      expect(found?.status).toBe('NEW')
    })
  })

  describe('getOrder', () => {
    it('returns undefined for unknown orderId', () => {
      expect(getOrder('nonexistent')).toBeUndefined()
    })
  })

  describe('getOrdersByGuest', () => {
    it('returns orders matching guestId + sessionId + roomNumber', () => {
      createOrder({
        orderId: 'order-a',
        requestId: 'req-a',
        roomNumber: 304,
        guestId: 'guest-1',
        sessionId: 'session-1',
        items: SAMPLE_ITEMS,
        total: 2400,
        notes: undefined,
      })
      createOrder({
        orderId: 'order-b',
        requestId: 'req-b',
        roomNumber: 305,
        guestId: 'guest-1',
        sessionId: 'session-1',
        items: SAMPLE_ITEMS,
        total: 2400,
        notes: undefined,
      })
      const orders = getOrdersByGuest('guest-1', 'session-1', 304)
      expect(orders).toHaveLength(1)
      expect(orders[0].orderId).toBe('order-a')
    })

    it('returns empty array when no orders match', () => {
      expect(getOrdersByGuest('nobody', 'none', 999)).toEqual([])
    })
  })

  describe('validateTransition', () => {
    it('allows NEW → PREPARING', () => {
      expect(validateTransition('NEW', 'PREPARING')).toBeNull()
    })

    it('allows PREPARING → READY', () => {
      expect(validateTransition('PREPARING', 'READY')).toBeNull()
    })

    it('allows READY → DELIVERED', () => {
      expect(validateTransition('READY', 'DELIVERED')).toBeNull()
    })

    it('rejects invalid status value', () => {
      expect(validateTransition('NEW', 'CANCELLED')).toContain('Invalid status')
    })

    it('rejects same status', () => {
      expect(validateTransition('NEW', 'NEW')).toContain('already NEW')
    })

    it('rejects skipped transition NEW → READY', () => {
      expect(validateTransition('NEW', 'READY')).toContain('Cannot transition')
    })

    it('rejects backwards transition PREPARING → NEW', () => {
      expect(validateTransition('PREPARING', 'NEW')).toContain('Cannot transition')
    })

    it('rejects changes after DELIVERED', () => {
      expect(validateTransition('DELIVERED', 'NEW')).toContain('already delivered')
    })

    it('rejects READY → PREPARING (backwards)', () => {
      expect(validateTransition('READY', 'PREPARING')).toContain('Cannot transition')
    })

    it('rejects DELIVERED → any', () => {
      expect(validateTransition('DELIVERED', 'PREPARING')).toContain('already delivered')
      expect(validateTransition('DELIVERED', 'READY')).toContain('already delivered')
    })
  })

  describe('updateOrderStatus', () => {
    it('updates NEW → PREPARING', () => {
      createOrder({
        orderId: 'order-t1',
        requestId: 'req-t1',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 1200,
        notes: undefined,
      })
      const result = updateOrderStatus('order-t1', 'PREPARING')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.order.status).toBe('PREPARING')
      }
    })

    it('updates PREPARING → READY', () => {
      createOrder({
        orderId: 'order-t2',
        requestId: 'req-t2',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 1200,
        notes: undefined,
      })
      updateOrderStatus('order-t2', 'PREPARING')
      const result = updateOrderStatus('order-t2', 'READY')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.order.status).toBe('READY')
      }
    })

    it('updates READY → DELIVERED', () => {
      createOrder({
        orderId: 'order-t3',
        requestId: 'req-t3',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 1200,
        notes: undefined,
      })
      updateOrderStatus('order-t3', 'PREPARING')
      updateOrderStatus('order-t3', 'READY')
      const result = updateOrderStatus('order-t3', 'DELIVERED')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.order.status).toBe('DELIVERED')
      }
    })

    it('rejects invalid status', () => {
      createOrder({
        orderId: 'order-t4',
        requestId: 'req-t4',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 1200,
        notes: undefined,
      })
      const result = updateOrderStatus('order-t4', 'CANCELLED')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('Invalid status')
      }
    })

    it('rejects skipped transition', () => {
      createOrder({
        orderId: 'order-t5',
        requestId: 'req-t5',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 1200,
        notes: undefined,
      })
      const result = updateOrderStatus('order-t5', 'READY')
      expect(result.ok).toBe(false)
    })

    it('rejects backwards transition', () => {
      createOrder({
        orderId: 'order-t6',
        requestId: 'req-t6',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 1200,
        notes: undefined,
      })
      updateOrderStatus('order-t6', 'PREPARING')
      const result = updateOrderStatus('order-t6', 'NEW')
      expect(result.ok).toBe(false)
    })

    it('returns error for nonexistent orderId', () => {
      const result = updateOrderStatus('nonexistent', 'PREPARING')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('not found')
      }
    })
  })

  describe('listOrders', () => {
    it('returns all orders when no filter is provided', () => {
      createOrder({
        orderId: 'order-l1',
        requestId: 'req-l1',
        roomNumber: 100,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 2400,
        notes: undefined,
      })
      createOrder({
        orderId: 'order-l2',
        requestId: 'req-l2',
        roomNumber: 200,
        guestId: 'g2',
        sessionId: 's2',
        items: [SAMPLE_ITEMS[0]],
        total: 1200,
        notes: undefined,
      })
      const orders = listOrders()
      expect(orders.length).toBeGreaterThanOrEqual(2)
    })

    it('filters orders by status', () => {
      createOrder({
        orderId: 'order-lf1',
        requestId: 'req-lf1',
        roomNumber: 300,
        guestId: 'g1',
        sessionId: 's1',
        items: SAMPLE_ITEMS,
        total: 2400,
        notes: undefined,
      })
      createOrder({
        orderId: 'order-lf2',
        requestId: 'req-lf2',
        roomNumber: 400,
        guestId: 'g2',
        sessionId: 's2',
        items: [SAMPLE_ITEMS[0]],
        total: 1200,
        notes: undefined,
      })
      updateOrderStatus('order-lf1', 'PREPARING')

      const preparing = listOrders('PREPARING')
      expect(preparing).toHaveLength(1)
      expect(preparing[0].orderId).toBe('order-lf1')
      expect(preparing[0].status).toBe('PREPARING')
    })

    it('does not expose guestId or sessionId', () => {
      createOrder({
        orderId: 'order-safe',
        requestId: 'req-safe',
        roomNumber: 500,
        guestId: 'g-secret',
        sessionId: 's-secret',
        items: SAMPLE_ITEMS,
        total: 2400,
        notes: 'test note',
      })
      const orders = listOrders()
      const order = orders.find((o) => o.orderId === 'order-safe')
      expect(order).toBeDefined()
      expect(order).not.toHaveProperty('guestId')
      expect(order).not.toHaveProperty('sessionId')
      expect(order).not.toHaveProperty('requestId')
    })

    it('returns empty array when no orders match filter', () => {
      expect(listOrders('DELIVERED')).toEqual([])
    })
  })
})
