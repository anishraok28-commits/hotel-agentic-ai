/**
 * Webhook transport abstraction.
 *
 * In mock mode (tests), submissions resolve against an in-memory stub.
 * In real mode, submissions are forwarded to the Make.com webhook URL
 * matching the workflow.
 *
 * The Frontend never sees webhook URLs; only the Backend holds them.
 */

export type WorkflowType = 'BOOKING' | 'ROOM_SERVICE' | 'LATE_CHECKOUT'

export interface WebhookPayload {
  readonly guestId: string
  readonly sessionId: string
  readonly roomNumber: number
  readonly mode: string
  readonly [key: string]: unknown
}

export interface WebhookSuccessResponse {
  readonly status: 'accepted' | 'completed'
  readonly requestId: string
  readonly message: string
  readonly data: Record<string, unknown>
}

export interface WebhookErrorResponse {
  readonly status: 'error'
  readonly requestId: string
  readonly message: string
  readonly code: string
  readonly data?: Record<string, unknown>
}

export type WebhookResponse = WebhookSuccessResponse | WebhookErrorResponse

export interface WebhookTransport {
  send(workflow: WorkflowType, payload: WebhookPayload): Promise<WebhookResponse>
}
