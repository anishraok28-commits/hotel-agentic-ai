/**
 * Route-mode-workflow mapping.
 *
 * Source of truth: docs/api-contract.md Section 5
 */

import type { WorkflowType } from '../webhook/transport.js'

export type BackendMode = 'AI_CONCIERGE' | 'QR_ROOM_SERVICE' | 'LATE_CHECKOUT'

export const WORKFLOW_BY_MODE: Readonly<Record<BackendMode, WorkflowType>> = {
  AI_CONCIERGE: 'BOOKING',
  QR_ROOM_SERVICE: 'ROOM_SERVICE',
  LATE_CHECKOUT: 'LATE_CHECKOUT',
}
