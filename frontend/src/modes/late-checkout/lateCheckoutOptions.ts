/** Mock late checkout extension options (11:00 standard checkout). */
export interface LateCheckoutOption {
  readonly hours: number
  readonly label: string
  readonly timeLabel: string
  readonly detail: string
}

export const LATE_CHECKOUT_OPTIONS: readonly LateCheckoutOption[] = [
  {
    hours: 1,
    label: 'Lazy morning',
    timeLabel: 'Until 12:00 PM',
    detail: '+ 1 hour after standard checkout',
  },
  {
    hours: 2,
    label: 'Relaxed departure',
    timeLabel: 'Until 1:00 PM',
    detail: '+ 2 hours after standard checkout',
  },
  {
    hours: 4,
    label: 'Full afternoon',
    timeLabel: 'Until 3:00 PM',
    detail: '+ 4 hours after standard checkout',
  },
] as const