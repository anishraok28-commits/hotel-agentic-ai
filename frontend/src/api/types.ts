/**
 * Request and response payloads mirroring the future Backend contract.
 * Source of truth: docs/api-contract.md.
 */

export type SubmitStatus = 'accepted' | 'completed'

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
  mode: 'QR_ROOM_SERVICE'
}

/** LATE_CHECKOUT | LATE_CHECKOUT payload. */
export interface LateCheckoutRequest {
  guestId: string
  sessionId: string
  roomNumber: number
  requestedTime: string
  mode: 'LATE_CHECKOUT'
}