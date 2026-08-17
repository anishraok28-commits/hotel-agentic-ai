/**
 * Mock webhook transport for tests.
 *
 * Resolves against in-memory stubs without touching the network.
 * Mirrors the real transport API so handlers are testable identically.
 */

import type {
  WebhookTransport,
  WorkflowType,
  WebhookPayload,
  WebhookResponse,
} from './transport.js'

let requestCounter = 0

function nextRequestId(): string {
  requestCounter += 1
  return `mock-${Date.now()}-${requestCounter}`
}

export function createMockTransport(): WebhookTransport {
  return {
    async send(
      _workflow: WorkflowType,
      _payload: WebhookPayload,
    ): Promise<WebhookResponse> {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return {
        status: 'accepted',
        requestId: nextRequestId(),
        message: 'Request mock-accepted. Real automation is not connected yet.',
        data: { submittedAt: new Date().toISOString() },
      }
    },
  }
}
