/**
 * Real webhook transport.
 *
 * Forwards payloads to Make.com webhooks using native fetch.
 * Never exposes URLs to the Frontend.
 *
 * Behaviour:
 * - POST JSON to the correct Make.com webhook URL
 * - Content-Type: application/json
 * - 30-second timeout via AbortController
 * - Network / fetch errors become safe AUTOMATION_FAILED responses
 * - Non-2xx responses become safe AUTOMATION_FAILED responses
 * - Successful JSON responses are forwarded to the Backend response
 * - Webhook URLs never appear in logs or error messages
 */

import type {
  WebhookTransport,
  WorkflowType,
  WebhookPayload,
  WebhookResponse,
} from './transport.js'
import type { EnvConfig } from '../config/env.js'

const FETCH_TIMEOUT_MS = 30_000

function webhookUrlForWorkflow(
  env: EnvConfig,
  workflow: WorkflowType,
): string {
  switch (workflow) {
    case 'BOOKING':
      return env.makeBookingWebhookUrl
    case 'ROOM_SERVICE':
      return env.makeRoomServiceWebhookUrl
    case 'LATE_CHECKOUT':
      return env.makeLateCheckoutWebhookUrl
  }
}

export function createRealTransport(env: EnvConfig): WebhookTransport {
  return {
    async send(
      workflow: WorkflowType,
      payload: WebhookPayload,
    ): Promise<WebhookResponse> {
      const url = webhookUrlForWorkflow(env, workflow)

      let response: Response
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        clearTimeout(timer)
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          return {
            status: 'error',
            requestId: crypto.randomUUID(),
            message: 'Make.com webhook timed out',
            code: 'AUTOMATION_FAILED',
          }
        }
        return {
          status: 'error',
          requestId: crypto.randomUUID(),
          message: 'Make.com webhook request failed',
          code: 'AUTOMATION_FAILED',
        }
      }

      if (!response.ok) {
        return {
          status: 'error',
          requestId: crypto.randomUUID(),
          message: `Make.com webhook returned HTTP ${response.status}`,
          code: 'AUTOMATION_FAILED',
        }
      }

      let data: Record<string, unknown>
      try {
        data = (await response.json()) as Record<string, unknown>
      } catch {
        return {
          status: 'error',
          requestId: crypto.randomUUID(),
          message: 'Make.com returned invalid JSON',
          code: 'AUTOMATION_FAILED',
        }
      }

      return {
        status: 'accepted',
        requestId: (data.requestId as string) ?? crypto.randomUUID(),
        message: (data.message as string) ?? 'Forwarded to Make.com',
        data: (data.data as Record<string, unknown>) ?? {
          workflow,
          status: 'accepted',
        },
      }
    },
  }
}
