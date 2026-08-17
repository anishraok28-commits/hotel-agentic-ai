import type { RoomServiceItem } from '@/api/types'

export type MenuCategory = 'food' | 'drink'

export interface MenuItem {
  readonly itemId: string
  readonly name: string
  readonly category: MenuCategory
  readonly unitPrice: number
  readonly description: string
}

/** Mock in-room menu. Menu data will live in Airtable later (docs/data-model.md). */
export const MENU: readonly MenuItem[] = [
  {
    itemId: 'menu.001',
    name: 'Club Sandwich',
    category: 'food',
    unitPrice: 1200,
    description: 'Triple layer, grilled chicken, bacon, egg and house aioli.',
  },
  {
    itemId: 'menu.002',
    name: 'Caprese Salad',
    category: 'food',
    unitPrice: 950,
    description: 'Buffalo mozzarella, heirloom tomato, basil and balsamic.',
  },
  {
    itemId: 'menu.003',
    name: 'Margherita Pizza',
    category: 'food',
    unitPrice: 1400,
    description: 'Wood-fired base, San Marzano tomato, fresh basil.',
  },
  {
    itemId: 'menu.004',
    name: 'Seasonal Soup',
    category: 'food',
    unitPrice: 700,
    description: 'Chef-specialty soup of the day with crusty bread.',
  },
  {
    itemId: 'menu.010',
    name: 'Fresh Orange Juice',
    category: 'drink',
    unitPrice: 600,
    description: 'Cold-pressed, served over ice.',
  },
  {
    itemId: 'menu.011',
    name: 'Sparkling Water',
    category: 'drink',
    unitPrice: 450,
    description: 'Still or sparkling, 750ml.',
  },
  {
    itemId: 'menu.012',
    name: 'Espresso',
    category: 'drink',
    unitPrice: 350,
    description: 'Single-origin house blend.',
  },
] as const

export interface CartLine extends RoomServiceItem {
  readonly name: string
  readonly unitPrice: number
  quantity: number
}

export function buildCart(): CartLine[] {
  return []
}

export function cartTotal(cart: readonly CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
}