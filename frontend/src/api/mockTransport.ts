/**
 * Mock transport.
 *
 * The Backend is intentionally NOT connected (clean rebuild, docs/api-contract.md
 * section 8). Until then every submission resolves against this in-memory mock.
 *
 * The public API mirrors the future fetch layer so modes never know that
 * they are talking to a mock today and the Backend tomorrow.
 */

import type {
  ApiErrorResponse,
  ApiSuccessResponse,
} from '@/api/types'
import type { FutureApiRoute } from '@/api/apiContract'
import { MOCK_API_ENABLED } from '@/config/appConfig'

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

let requestCounter = 0

function nextRequestId(): string {
  requestCounter += 1
  return `mock-${Date.now()}-${requestCounter}`
}

/** Dummy guest + session ids so payloads stay contract-complete. */
export interface GuestContext {
  guestId: string
  sessionId: string
}

export function createGuestContext(): GuestContext {
  const randomPart = Math.random().toString(36).slice(2, 12)
  return {
    guestId: `guest-${randomPart}`,
    sessionId: `session-${randomPart}`,
  }
}

/**
 * Submit a (mock) mode submission and await the future Backend response.
 * This never touches the network while MOCK_API_ENABLED is true.
 */
export async function submit(
  _route: FutureApiRoute,
  _payload: unknown,
): Promise<ApiSuccessResponse | ApiErrorResponse> {
  if (!MOCK_API_ENABLED) {
    // Future: perform the real fetch against appConfig.apiBaseUrl + route here.
    throw new Error('Real backend transport not implemented yet')
  }

  await sleep(600)

  return {
    status: 'accepted',
    requestId: nextRequestId(),
    message: 'Request mock-accepted. Real automation is not connected yet.',
    data: { submittedAt: new Date().toISOString() },
  }
}