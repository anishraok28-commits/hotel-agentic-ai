/**
 * Submission transport.
 *
 * While MOCK_API_ENABLED is true every submission resolves against this
 * in-memory mock. When MOCK_API_ENABLED is false (VITE_MOCK_API_ENABLED=false),
 * submissions are POSTed to the Backend via fetch.
 *
 * Guest authentication uses QR token + session credentials obtained from
 * the backend's /api/guest/init endpoint. No static SERVICE_TOKEN is used.
 *
 * The public API mirrors the fetch layer so modes never know that they are
 * talking to a mock today and the Backend tomorrow.
 */

import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  OrderStatus,
  StaffOrder,
} from '@/api/types'
import type { FutureApiRoute } from '@/api/apiContract'
import { appConfig, MOCK_API_ENABLED } from '@/config/appConfig'

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const FETCH_TIMEOUT_MS = 30_000

let requestCounter = 0

function nextRequestId(): string {
  requestCounter += 1
  return `mock-${Date.now()}-${requestCounter}`
}

/** Guest session context obtained from /api/guest/init. */
export interface GuestContext {
  roomId: number
  guestId: string
  sessionId: string
}

/** In-memory guest context for mock mode. */
let mockGuestContext: GuestContext | null = null

/**
 * Initialize a guest session via the backend /api/guest/init endpoint.
 * In mock mode, returns stub credentials. In real mode, exchanges the
 * QR token for server-generated session credentials.
 */
export async function initGuestSession(
  qrToken: string,
  roomNumber: number,
): Promise<ApiSuccessResponse<GuestContext> | ApiErrorResponse> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    mockGuestContext = {
      roomId: roomNumber,
      guestId: `guest-${crypto.randomUUID()}`,
      sessionId: `session-${crypto.randomUUID()}`,
    }
    return {
      status: 'accepted',
      requestId: nextRequestId(),
      message: 'Session initialized',
      data: mockGuestContext,
    }
  }

  const url = `${appConfig.apiBaseUrl}/api/guest/init`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrToken, roomNumber }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) {
      const body = await parseResponseBody(response)
      if (isErrorResponse(body)) return body
      return {
        status: 'error',
        requestId: 'local-http',
        message: `Failed to initialize session (HTTP ${response.status}).`,
        code: 'INTERNAL_ERROR',
      }
    }

    const body = await parseResponseBody(response)
    if (isRecord(body) && body.status === 'ok' && body.data) {
      const data = body.data as Record<string, unknown>
      const ctx: GuestContext = {
        roomId: (data.roomId as number) ?? roomNumber,
        guestId: data.guestId as string,
        sessionId: data.sessionId as string,
      }
      mockGuestContext = ctx
      return {
        status: 'accepted',
        requestId: (body.requestId as string) ?? nextRequestId(),
        message: (body.message as string) ?? 'Session created',
        data: ctx,
      }
    }

    return {
      status: 'error',
      requestId: 'local-parse',
      message: 'Unexpected response from session init.',
      code: 'INTERNAL_ERROR',
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        requestId: 'local-timeout',
        message: 'Session init timed out. Please try again.',
        code: 'INTERNAL_ERROR',
      }
    }
    return {
      status: 'error',
      requestId: 'local-network',
      message: 'Failed to reach the backend service',
      code: 'AUTOMATION_FAILED',
    }
  }
}

/**
 * Get the current guest context. In mock mode, returns the in-memory
 * context. In real mode, returns the context from the last init call.
 */
export function getGuestContext(): GuestContext | null {
  return mockGuestContext
}

/** Track the latest mock order per room for status checking. */
let mockOrderState: {
  orderId: string
  status: OrderStatus
  roomNumber: number
  items: Array<{ itemId: string; name: string; quantity: number; unitPrice: number }>
  total: number
  createdAt: string
} | null = null

export function resetMockOrderState() {
  mockOrderState = null
}

/** Mock room data for admin management. */
let mockRooms: Array<{
  roomNumber: number
  qrToken: string
  active: boolean
  createdAt: number
  updatedAt: number
}> = []

export interface RoomData {
  roomNumber: number
  qrToken: string
  active: boolean
  createdAt: number
  updatedAt: number
}

/**
 * List all rooms.
 * In mock mode, returns the in-memory mock rooms.
 * In real mode, GETs /api/admin/rooms with Bearer auth.
 */
export async function listRooms(): Promise<{ rooms: RoomData[] }> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    return { rooms: mockRooms }
  }

  const url = `${appConfig.apiBaseUrl}/api/admin/rooms`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }

  const response = await fetch(url, { method: 'GET', headers })
  if (!response.ok) return { rooms: [] }
  const body = (await response.json()) as { data?: { rooms?: RoomData[] } }
  return { rooms: body.data?.rooms ?? [] }
}

/**
 * Create a new room with a QR token.
 * In mock mode, generates a mock token.
 * In real mode, POSTs to /api/admin/rooms with Bearer auth.
 */
export async function createRoom(
  roomNumber: number,
): Promise<{ room: RoomData; qrUrl: string }> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    const qrToken = `mock-token-${roomNumber}-${Date.now()}`
    const room: RoomData = {
      roomNumber,
      qrToken,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    mockRooms = [...mockRooms.filter((r) => r.roomNumber !== roomNumber), room]
    const frontendUrl = window.location.origin
    const qrUrl = `${frontendUrl}/?token=${encodeURIComponent(qrToken)}&room=${roomNumber}`
    return { room, qrUrl }
  }

  const url = `${appConfig.apiBaseUrl}/api/admin/rooms`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ roomNumber }),
  })

  const body = (await response.json()) as {
    data?: { room?: RoomData; qrUrl?: string }
  }
  return {
    room: body.data?.room ?? { roomNumber, qrToken: '', active: true, createdAt: Date.now(), updatedAt: Date.now() },
    qrUrl: body.data?.qrUrl ?? '',
  }
}

/**
 * Update a room's active status.
 * In mock mode, updates the in-memory mock room.
 * In real mode, PATCHes /api/admin/rooms/:roomNumber with Bearer auth.
 */
export async function updateRoom(
  roomNumber: number,
  active: boolean,
): Promise<{ room: RoomData }> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    mockRooms = mockRooms.map((r) =>
      r.roomNumber === roomNumber ? { ...r, active, updatedAt: Date.now() } : r,
    )
    const room = mockRooms.find((r) => r.roomNumber === roomNumber)
    return { room: room ?? { roomNumber, qrToken: '', active, createdAt: Date.now(), updatedAt: Date.now() } }
  }

  const url = `${appConfig.apiBaseUrl}/api/admin/rooms/${roomNumber}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ active }),
  })

  const body = (await response.json()) as { data?: { room?: RoomData } }
  return { room: body.data?.room ?? { roomNumber, qrToken: '', active, createdAt: Date.now(), updatedAt: Date.now() } }
}

/**
 * Deactivate a room.
 * In mock mode, removes from in-memory mock rooms.
 * In real mode, DELETEs /api/admin/rooms/:roomNumber with Bearer auth.
 */
export async function deleteRoom(
  roomNumber: number,
): Promise<{ success: boolean }> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    mockRooms = mockRooms.map((r) =>
      r.roomNumber === roomNumber ? { ...r, active: false, updatedAt: Date.now() } : r,
    )
    return { success: true }
  }

  const url = `${appConfig.apiBaseUrl}/api/admin/rooms/${roomNumber}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }

  const response = await fetch(url, { method: 'DELETE', headers })
  return { success: response.ok }
}

/**
 * Check order status via the backend /api/order/status endpoint.
 * In mock mode, returns the current mock order state.
 */
export async function checkOrderStatus(
  _orderId: string,
  auth?: { guestId: string; sessionId: string; qrToken: string },
): Promise<ApiSuccessResponse | ApiErrorResponse> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    if (!mockOrderState) {
      return {
        status: 'error',
        requestId: nextRequestId(),
        message: 'Order not found',
        code: 'NOT_FOUND',
      }
    }
    return {
      status: 'accepted',
      requestId: nextRequestId(),
      message: 'Order found',
      data: {
        orderId: mockOrderState.orderId,
        status: mockOrderState.status,
        roomNumber: mockOrderState.roomNumber,
        items: mockOrderState.items,
        total: mockOrderState.total,
        createdAt: mockOrderState.createdAt,
      },
    }
  }

  const url = `${appConfig.apiBaseUrl}/api/order/status`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: _orderId,
        qrToken: auth?.qrToken ?? '',
        guestId: auth?.guestId ?? '',
        sessionId: auth?.sessionId ?? '',
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const body = await parseResponseBody(response)
    if (isSuccessResponse(body)) return body
    if (isErrorResponse(body)) return body
    return {
      status: 'error',
      requestId: 'local-parse',
      message: 'Unexpected response from order status.',
      code: 'INTERNAL_ERROR',
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        requestId: 'local-timeout',
        message: 'Order status request timed out.',
        code: 'INTERNAL_ERROR',
      }
    }
    return {
      status: 'error',
      requestId: 'local-network',
      message: 'Failed to reach the backend service',
      code: 'AUTOMATION_FAILED',
    }
  }
}

/** Create a guest context for mock mode (backward compatibility). */
export function createGuestContext(): GuestContext {
  if (mockGuestContext) return mockGuestContext
  mockGuestContext = {
    roomId: 0,
    guestId: `guest-${crypto.randomUUID()}`,
    sessionId: `session-${crypto.randomUUID()}`,
  }
  return mockGuestContext
}

/**
 * Submit a mode submission and await the Backend response.
 * Resolves against the in-memory mock while MOCK_API_ENABLED is true;
 * otherwise POSTs to the Backend at appConfig.apiBaseUrl + route.
 *
 * Guest authentication is handled by QR token + session credentials
 * included in the payload (guestId, sessionId, qrToken). No static
 * SERVICE_TOKEN is used for guest-facing requests.
 */
export async function submit(
  route: FutureApiRoute,
  payload: unknown,
): Promise<ApiSuccessResponse | ApiErrorResponse> {
  if (MOCK_API_ENABLED) {
    await sleep(600)

    const requestId = nextRequestId()

    // For room-service, return order-like data with orderId and status
    if (route === 'POST /api/room-service' && typeof payload === 'object' && payload !== null) {
      const p = payload as Record<string, unknown>
      const items = (p.items as Array<{ itemId: string; name: string; quantity: number; unitPrice: number }>) ?? []
      const total = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
      const orderId = crypto.randomUUID()

      mockOrderState = {
        orderId,
        status: 'NEW' as OrderStatus,
        roomNumber: (p.roomNumber as number) ?? 0,
        items,
        total,
        createdAt: new Date().toISOString(),
      }

      return {
        status: 'accepted',
        requestId,
        message: 'Order accepted',
        data: {
          orderId,
          status: 'NEW',
          roomNumber: p.roomNumber,
          items,
          total,
          createdAt: mockOrderState.createdAt,
          submittedAt: new Date().toISOString(),
        },
      }
    }

    return {
      status: 'accepted',
      requestId,
      message: 'Request accepted',
      data: { submittedAt: new Date().toISOString() },
    }
  }

  const url = `${appConfig.apiBaseUrl}${pathForRoute(route)}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // No SERVICE_TOKEN header — guest routes use QR token + session auth

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await parseResponseBody(response)
      if (isErrorResponse(body)) {
        return body
      }
      return {
        status: 'error',
        requestId: 'local-http',
        message: `The backend returned an error (HTTP ${response.status}).`,
        code: 'INTERNAL_ERROR',
      }
    }

    const body = await parseResponseBody(response)
    if (isSuccessResponse(body)) {
      return body
    }
    if (isErrorResponse(body)) {
      return body
    }
    return {
      status: 'error',
      requestId: 'local-parse',
      message: 'The backend returned an unexpected response.',
      code: 'INTERNAL_ERROR',
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        requestId: 'local-timeout',
        message: 'The request timed out. Please try again.',
        code: 'INTERNAL_ERROR',
      }
    }
    return {
      status: 'error',
      requestId: 'local-network',
      message: 'Failed to reach the backend service',
      code: 'AUTOMATION_FAILED',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSuccessResponse(value: unknown): value is ApiSuccessResponse {
  return isRecord(value) && (value.status === 'accepted' || value.status === 'ok') && typeof value.message === 'string'
}

function isErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    isRecord(value) &&
    value.status === 'error' &&
    typeof value.message === 'string' &&
    typeof value.code === 'string'
  )
}

function pathForRoute(route: FutureApiRoute): string {
  return route.slice('POST '.length)
}

/**
 * Fetch admin orders list.
 * In mock mode, returns the current mockOrderState as an array (if any).
 * In real mode, GETs /api/admin/orders with optional status filter.
 */
export async function listAdminOrders(
  statusFilter?: string,
): Promise<{ orders: StaffOrder[] }> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    if (!mockOrderState) return { orders: [] }
    const order: StaffOrder = {
      orderId: mockOrderState.orderId,
      roomNumber: mockOrderState.roomNumber,
      items: mockOrderState.items,
      total: mockOrderState.total,
      notes: undefined,
      status: mockOrderState.status,
      createdAt: mockOrderState.createdAt,
      updatedAt: mockOrderState.createdAt,
    }
    if (statusFilter && order.status !== statusFilter) return { orders: [] }
    return { orders: [order] }
  }

  const params = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ''
  const url = `${appConfig.apiBaseUrl}/api/admin/orders${params}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }
  const response = await fetch(url, {
    method: 'GET',
    headers,
  })

  if (!response.ok) return { orders: [] }
  const body = (await response.json()) as { data?: { orders?: StaffOrder[] } }
  return { orders: body.data?.orders ?? [] }
}

/**
 * Update an order's status via the backend /api/order/update-status endpoint.
 * In mock mode, updates the in-memory mockOrderState.
 * In real mode, POSTs with Bearer token authentication.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
): Promise<ApiSuccessResponse | ApiErrorResponse> {
  if (MOCK_API_ENABLED) {
    await sleep(300)
    if (!mockOrderState || mockOrderState.orderId !== orderId) {
      return {
        status: 'error',
        requestId: nextRequestId(),
        message: 'Order not found',
        code: 'NOT_FOUND',
      }
    }
    mockOrderState = { ...mockOrderState, status: newStatus }
    return {
      status: 'accepted',
      requestId: nextRequestId(),
      message: 'Order status updated',
      data: {
        orderId,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  const url = `${appConfig.apiBaseUrl}/api/order/update-status`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (appConfig.serviceToken) {
    headers['Authorization'] = `Bearer ${appConfig.serviceToken}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, status: newStatus }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const body = await parseResponseBody(response)
    if (isSuccessResponse(body)) return body
    if (isErrorResponse(body)) return body
    return {
      status: 'error',
      requestId: 'local-parse',
      message: 'Unexpected response from order status update.',
      code: 'INTERNAL_ERROR',
    }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        status: 'error',
        requestId: 'local-timeout',
        message: 'Order status update timed out.',
        code: 'INTERNAL_ERROR',
      }
    }
    return {
      status: 'error',
      requestId: 'local-network',
      message: 'Failed to reach the backend service',
      code: 'AUTOMATION_FAILED',
    }
  }
}