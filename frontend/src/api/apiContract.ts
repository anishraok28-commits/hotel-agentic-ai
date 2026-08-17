/**
 * Future API contract.
 *
 * Source of truth: docs/api-contract.md - Route Definitions.
 *
 * These routes are DECLARED but NOT implemented. The frontend currently uses
 * the mock transport in src/api/mockTransport.ts. When the Backend exists,
 * these constants become the fetch targets so no mode code changes.
 */

import type { FrontendMode } from '@/modes/modeRegistry'

export type FutureApiRoute =
  | 'POST /api/concierge'
  | 'POST /api/room-service'
  | 'POST /api/late-checkout'

/**
 * Maps each of the three routable modes to its future Backend route.
 * 3_IN_1_UNIFIED is deliberately absent: it has no route of its own.
 */
export const ROUTE_BY_MODE: Readonly<Record<FrontendMode, FutureApiRoute | null>> = {
  AI_CONCIERGE: 'POST /api/concierge',
  QR_ROOM_SERVICE: 'POST /api/room-service',
  LATE_CHECKOUT: 'POST /api/late-checkout',
  '3_IN_1_UNIFIED': null,
}

export function futureRouteFor(mode: FrontendMode): FutureApiRoute | null {
  return ROUTE_BY_MODE[mode]
}