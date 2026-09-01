/**
 * Request and response payloads mirroring the future Backend contract.
 * Source of truth: docs/api-contract.md.
 */

export type SubmitStatus = 'accepted' | 'completed'

export type OrderStatus = 'NEW' | 'PREPARING' | 'READY' | 'DELIVERED'

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'MISSING_FIELD'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'AUTOMATION_FAILED'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR'

/** Success response shape (docs/api-contract.md, section 3.1). */
export interface ApiSuccessResponse<D = Record<string, unknown>> {
  status: SubmitStatus
  requestId: string
  message: string
  data: D
}

/** Error response shape (docs/api-contract.md, section 3.2). */
export interface ApiErrorResponse {
  status: 'error'
  requestId: string
  message: string
  code: ApiErrorCode
}

/** AIConcierge | BOOKING payload (docs/api-contract.md, section 4.2). */
export interface ConciergeRequest {
  guestId: string
  sessionId: string
  roomNumber: number
  request: string
  mode: 'AI_CONCIERGE'
}

/** RoomService item (docs/api-contract.md, section 4.3). */
export interface RoomServiceItem {
  itemId: string
  name: string
  quantity: number
  unitPrice: number
}

/** QR_ROOM_SERVICE | ROOM_SERVICE payload. */
export interface RoomServiceRequest {
  guestId: string
  sessionId: string
  roomNumber: number
  items: RoomServiceItem[]
  notes?: string
  qrToken?: string
  mode: 'QR_ROOM_SERVICE'
}

/** LATE_CHECKOUT | LATE_CHECKOUT payload. */
export interface LateCheckoutRequest {
  guestId: string
  sessionId: string
  roomNumber: number
  requestedTime: string
  qrToken?: string
  mode: 'LATE_CHECKOUT'
}

/** Order details returned in room-service success response. */
export interface OrderDetails {
  orderId: string
  status: OrderStatus
  roomNumber: number
  items: RoomServiceItem[]
  total: number
  createdAt: string
}

/** Safe operational order data for admin/staff views (no guest/session internals). */
export interface StaffOrder {
  orderId: string
  roomNumber: number
  items: RoomServiceItem[]
  total: number
  notes: string | undefined
  status: OrderStatus
  createdAt: string
  updatedAt: string
}