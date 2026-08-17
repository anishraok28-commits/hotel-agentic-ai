import { useState } from 'react'
import { createGuestContext, submit } from '@/api/mockTransport'
import { futureRouteFor } from '@/api/apiContract'
import type {
  ApiErrorResponse,
  ApiSuccessResponse,
  ConciergeRequest,
  LateCheckoutRequest,
  RoomServiceRequest,
} from '@/api/types'
import type { FrontendMode } from '@/modes/modeRegistry'

export type SubmitPayload = ConciergeRequest | RoomServiceRequest | LateCheckoutRequest

export type SubmitResult =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading' }
  | { readonly phase: 'success'; readonly response: ApiSuccessResponse }
  | { readonly phase: 'error'; readonly error: ApiErrorResponse }

function toError(message: string): ApiErrorResponse {
  return {
    status: 'error',
    requestId: 'local-validation',
    message,
    code: 'MISSING_FIELD',
  }
}

/**
 * Central submit state machine shared by the three mode forms.
 * TODAY it posts to the mock transport; later the same hook posts to the
 * Backend with zero changes to the mode views.
 */
export function useModeSubmit(mode: FrontendMode) {
  const [result, setResult] = useState<SubmitResult>({ phase: 'idle' })

  async function run(payload: SubmitPayload): Promise<void> {
    const route = futureRouteFor(mode)
    if (!route) {
      setResult({ phase: 'error', error: toError('This mode has no API route of its own.') })
      return
    }

    const guestContext = createGuestContext()
    const enriched = { ...payload, ...guestContext }

    setResult({ phase: 'loading' })
    const response = await submit(route, enriched)

    if (response.status === 'error') {
      setResult({ phase: 'error', error: response })
      return
    }

    setResult({ phase: 'success', response })
  }

  function reset(): void {
    setResult({ phase: 'idle' })
  }

  return { result, run, reset }
}