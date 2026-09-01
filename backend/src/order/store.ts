/**
 * SQLite-backed order store for room-service orders.
 *
 * Each accepted room-service order is stored with a lifecycle:
 * NEW → PREPARING → READY → DELIVERED
 *
 * Data persists across backend restarts via SQLite.
 */

import { getDatabase } from '../db/database.js'

export type OrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED'

export interface OrderItem {
  readonly itemId: string
  readonly name: string
  readonly quantity: number
  readonly unitPrice: number
}

export interface Order {
  readonly orderId: string
  readonly requestId: string
  readonly roomNumber: number
  readonly guestId: string
  readonly sessionId: string
  readonly items: readonly OrderItem[]
  readonly total: number
  readonly notes: string | undefined
  status: OrderStatus
  readonly createdAt: number
  updatedAt: number
}

/** Allowed forward transitions: current status → next status. */
const VALID_TRANSITIONS: Readonly<Record<OrderStatus, OrderStatus | undefined>> = {
  NEW: 'PREPARING',
  PREPARING: 'READY',
  READY: 'DELIVERED',
  DELIVERED: undefined,
}

/** All valid status string values. */
const VALID_STATUSES: ReadonlySet<string> = new Set<OrderStatus>([
  'NEW', 'PREPARING', 'READY', 'DELIVERED',
])

/**
 * Validate whether a status transition is allowed.
 * Returns null if valid, or an error message if invalid.
 */
export function validateTransition(current: OrderStatus, next: string): string | null {
  if (!VALID_STATUSES.has(next)) {
    return `Invalid status "${next}". Allowed: NEW, PREPARING, READY, DELIVERED`
  }
  if (next === current) {
    return `Order is already ${current}`
  }
  const expected = VALID_TRANSITIONS[current]
  if (expected === undefined) {
    return `Order is already delivered and cannot be updated`
  }
  if (expected !== next) {
    return `Cannot transition from ${current} to ${next}. Allowed: ${expected}`
  }
  return null
}

function rowToOrder(row: {
  order_id: string
  request_id: string
  room_number: number
  guest_id: string
  session_id: string
  items: string
  total: number
  notes: string | null
  status: string
  created_at: number
  updated_at: number
}): Order {
  return {
    orderId: row.order_id,
    requestId: row.request_id,
    roomNumber: row.room_number,
    guestId: row.guest_id,
    sessionId: row.session_id,
    items: JSON.parse(row.items) as readonly OrderItem[],
    total: row.total,
    notes: row.notes ?? undefined,
    status: row.status as OrderStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Create a new order. Returns the created order. */
export function createOrder(params: {
  readonly orderId: string
  readonly requestId: string
  readonly roomNumber: number
  readonly guestId: string
  readonly sessionId: string
  readonly items: readonly OrderItem[]
  readonly total: number
  readonly notes: string | undefined
}): Order {
  const now = Date.now()
  const db = getDatabase()

  db.prepare(
    `INSERT INTO orders (order_id, request_id, room_number, guest_id, session_id, items, total, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?)`,
  ).run(
    params.orderId,
    params.requestId,
    params.roomNumber,
    params.guestId,
    params.sessionId,
    JSON.stringify(params.items),
    params.total,
    params.notes ?? null,
    now,
    now,
  )

  return {
    orderId: params.orderId,
    requestId: params.requestId,
    roomNumber: params.roomNumber,
    guestId: params.guestId,
    sessionId: params.sessionId,
    items: params.items,
    total: params.total,
    notes: params.notes,
    status: 'NEW',
    createdAt: now,
    updatedAt: now,
  }
}

/** Retrieve an order by orderId, or undefined if not found. */
export function getOrder(orderId: string): Order | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM orders WHERE order_id = ?').get(orderId) as
    | {
        order_id: string
        request_id: string
        room_number: number
        guest_id: string
        session_id: string
        items: string
        total: number
        notes: string | null
        status: string
        created_at: number
        updated_at: number
      }
    | undefined

  return row ? rowToOrder(row) : undefined
}

/**
 * Retrieve orders belonging to a specific guest (matched by guestId + sessionId + roomNumber).
 * Returns an empty array if no orders match.
 */
export function getOrdersByGuest(
  guestId: string,
  sessionId: string,
  roomNumber: number,
): Order[] {
  const db = getDatabase()
  const rows = db.prepare(
    'SELECT * FROM orders WHERE guest_id = ? AND session_id = ? AND room_number = ?',
  ).all(guestId, sessionId, roomNumber) as Array<{
    order_id: string
    request_id: string
    room_number: number
    guest_id: string
    session_id: string
    items: string
    total: number
    notes: string | null
    status: string
    created_at: number
    updated_at: number
  }>

  return rows.map(rowToOrder)
}

/**
 * Update the status of an order. Validates the transition before applying.
 * Returns the updated order on success, or an error message on failure.
 */
export function updateOrderStatus(
  orderId: string,
  newStatus: string,
): { readonly ok: true; readonly order: Order } | { readonly ok: false; readonly error: string } {
  const order = getOrder(orderId)
  if (!order) {
    return { ok: false, error: `Order ${orderId} not found` }
  }

  const transitionError = validateTransition(order.status, newStatus)
  if (transitionError !== null) {
    return { ok: false, error: transitionError }
  }

  const now = Date.now()
  const db = getDatabase()
  db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE order_id = ?').run(
    newStatus,
    now,
    orderId,
  )

  return {
    ok: true,
    order: { ...order, status: newStatus as OrderStatus, updatedAt: now },
  }
}

/** Test helper: clear all orders. */
export function clearOrders(): void {
  const db = getDatabase()
  db.prepare('DELETE FROM orders').run()
}

/** Safe operational order data for admin views (no guest/session internals). */
export interface StaffOrder {
  readonly orderId: string
  readonly roomNumber: number
  readonly items: readonly OrderItem[]
  readonly total: number
  readonly notes: string | undefined
  readonly status: OrderStatus
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * List orders for admin/staff views. Optionally filters by status.
 * Returns safe operational data only — no guestId, sessionId, or requestId.
 */
export function listOrders(statusFilter?: string): StaffOrder[] {
  const db = getDatabase()

  let rows: Array<{
    order_id: string
    room_number: number
    items: string
    total: number
    notes: string | null
    status: string
    created_at: number
    updated_at: number
  }>

  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    rows = db.prepare(
      'SELECT order_id, room_number, items, total, notes, status, created_at, updated_at FROM orders WHERE status = ? ORDER BY created_at DESC',
    ).all(statusFilter) as typeof rows
  } else {
    rows = db.prepare(
      'SELECT order_id, room_number, items, total, notes, status, created_at, updated_at FROM orders ORDER BY created_at DESC',
    ).all() as typeof rows
  }

  return rows.map((row) => ({
    orderId: row.order_id,
    roomNumber: row.room_number,
    items: JSON.parse(row.items) as readonly OrderItem[],
    total: row.total,
    notes: row.notes ?? undefined,
    status: row.status as OrderStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}
