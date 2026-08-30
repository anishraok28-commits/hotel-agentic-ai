/** Mock concierge request categories (ui aids, not part of the API contract). */
export interface ConciergeCategory {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly sampleRequest: string
}

/** Primary categories shown in the main grid. */
export const PRIMARY_CATEGORIES: readonly ConciergeCategory[] = [
  {
    id: 'hotel-room',
    label: 'Hotel & Room Help',
    icon: 'bed',
    sampleRequest: 'I need help with something in my room — extra towels, pillows, or a maintenance issue.',
  },
  {
    id: 'food-dining',
    label: 'Food & Dining',
    icon: 'utensils',
    sampleRequest: 'Can you recommend restaurants near the hotel and help me book a table?',
  },
  {
    id: 'housekeeping',
    label: 'Housekeeping',
    icon: 'broom',
    sampleRequest: 'Could I schedule a room cleaning or request fresh linens?',
  },
  {
    id: 'transport',
    label: 'Transport & Airport',
    icon: 'car',
    sampleRequest: 'I need help arranging an airport transfer or local transport.',
  },
  {
    id: 'local',
    label: 'Local Things to Do',
    icon: 'map',
    sampleRequest: 'What are the best local attractions or activities around the hotel?',
  },
  {
    id: 'more-services',
    label: 'More Services',
    icon: 'grid',
    sampleRequest: '',
  },
] as const

/** Additional categories revealed when "More Services" is selected. */
export const MORE_CATEGORIES: readonly ConciergeCategory[] = [
  {
    id: 'wellness',
    label: 'Spa & Wellness',
    icon: 'flower',
    sampleRequest: 'Can you recommend a spa treatment and help me book a time?',
  },
  {
    id: 'activities',
    label: 'Activities & Experiences',
    icon: 'compass',
    sampleRequest: 'What unique experiences or guided activities do you offer for guests?',
  },
  {
    id: 'checkin-checkout',
    label: 'Check-in / Check-out',
    icon: 'clock',
    sampleRequest: 'Can I get a late checkout or change my check-in time?',
  },
  {
    id: 'payments',
    label: 'Payments & Hotel Charges',
    icon: 'creditCard',
    sampleRequest: 'I have a question about my bill or need to update my payment method.',
  },
  {
    id: 'special',
    label: 'Special Requests',
    icon: 'sparkles',
    sampleRequest: 'I have a special occasion — can you help arrange something memorable?',
  },
] as const

/** Combined list for backward compatibility and iteration. */
export const CONCIERGE_CATEGORIES: readonly ConciergeCategory[] = [
  ...PRIMARY_CATEGORIES.filter((c) => c.id !== 'more-services'),
  ...MORE_CATEGORIES,
] as const
