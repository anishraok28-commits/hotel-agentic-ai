/**
 * Frontend mode definitions.
 *
 * Source of truth: docs/architecture.md - "Four frontend modes" and
 * docs/api-contract.md - "Route, Mode, Workflow Mapping".
 *
 * There are exactly four modes. 3_IN_1_UNIFIED is a client-side routing
 * layer only; it has NO API route of its own.
 */

export type FrontendMode =
  | 'AI_CONCIERGE'
  | 'QR_ROOM_SERVICE'
  | 'LATE_CHECKOUT'
  | '3_IN_1_UNIFIED'

export interface ModeCardInfo {
  /** Stable machine-readable mode id. */
  readonly id: FrontendMode
  /** Display title shown to guests. */
  readonly title: string
  /** Short human-readable summary. */
  readonly description: string
  /** Client-side path within this single frontend. */
  readonly path: string
  /** Visual key used for theming. */
  readonly accent: string
  /** Icon key rendered by the Icon layer. */
  readonly icon: string
}

/** Order in which modes appear in navigation (3_IN_1_UNIFIED last). */
export const MODE_ORDER: readonly FrontendMode[] = [
  'AI_CONCIERGE',
  'QR_ROOM_SERVICE',
  'LATE_CHECKOUT',
  '3_IN_1_UNIFIED',
] as const

export const MODES: Readonly<Record<FrontendMode, ModeCardInfo>> = {
  AI_CONCIERGE: {
    id: 'AI_CONCIERGE',
    title: 'AI Concierge',
    description: 'AI-powered concierge interactions, questions and recommendations.',
    path: '/concierge',
    accent: 'indigo',
    icon: 'sparkles',
  },
  QR_ROOM_SERVICE: {
    id: 'QR_ROOM_SERVICE',
    title: 'QR Room Service',
    description: 'Order food and drink from your room with the QR code.',
    path: '/room-service',
    accent: 'amber',
    icon: 'utensils',
  },
  LATE_CHECKOUT: {
    id: 'LATE_CHECKOUT',
    title: 'Late Checkout',
    description: 'Request an extended checkout time for your stay.',
    path: '/late-checkout',
    accent: 'sky',
    icon: 'clock',
  },
  '3_IN_1_UNIFIED': {
    id: '3_IN_1_UNIFIED',
    title: 'Guest Services',
    description: 'One entry point that routes to concierge, room service or late checkout.',
    path: '/',
    accent: 'emerald',
    icon: 'grid',
  },
}

/**
 * The three *routable* modes reachable from the 3_IN_1_UNIFIED entry point.
 * 3_IN_1_UNIFIED itself is intentionally excluded (it is a router, not a product flow).
 */
export const ROUTABLE_MODES: readonly ModeCardInfo[] = [
  MODES.AI_CONCIERGE,
  MODES.QR_ROOM_SERVICE,
  MODES.LATE_CHECKOUT,
] as const

export function isFrontendMode(value: string): value is FrontendMode {
  return MODE_ORDER.includes(value as FrontendMode)
}