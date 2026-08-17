/** Mock concierge request categories (ui aids, not part of the API contract). */
export interface ConciergeCategory {
  readonly id: string
  readonly label: string
  readonly icon: string
  readonly sampleRequest: string
}

export const CONCIERGE_CATEGORIES: readonly ConciergeCategory[] = [
  {
    id: 'dining',
    label: 'Dining & reservations',
    icon: 'utensils',
    sampleRequest: 'Please recommend restaurants near the hotel and help me book a table.',
  },
  {
    id: 'local',
    label: 'Local recommendations',
    icon: 'map',
    sampleRequest: 'What are the best local attractions or hidden gems around the hotel?',
  },
  {
    id: 'transport',
    label: 'Transportation',
    icon: 'car',
    sampleRequest: 'I need help arranging airport transfers or local transport.',
  },
  {
    id: 'wellness',
    label: 'Spa & wellness',
    icon: 'flower',
    sampleRequest: 'Can you recommend a spa treatment and help me book a time?',
  },
  {
    id: 'events',
    label: 'Events & tickets',
    icon: 'ticket',
    sampleRequest: 'Please help me find and book tickets to shows or events nearby.',
  },
  {
    id: 'other',
    label: 'Something else',
    icon: 'sparkles',
    sampleRequest: '',
  },
] as const