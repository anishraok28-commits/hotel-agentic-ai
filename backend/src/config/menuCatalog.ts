/**
 * Server-side menu catalog.
 *
 * The single source of truth for menu item identities and prices. The
 * Frontend and Backend never trust client-sent `name`/`unitPrice`; the
 * Backend rewrites them from this catalog before forwarding to Make.com
 * so forged prices can never reach Airtable.
 *
 * Kept in sync with frontend/src/modes/room-service/menu.ts.
 */

export interface MenuCatalogItem {
  readonly itemId: string
  readonly name: string
  readonly unitPrice: number
}

const MENU_CATALOG_ITEMS: readonly MenuCatalogItem[] = [
  { itemId: 'menu.001', name: 'Club Sandwich', unitPrice: 1200 },
  { itemId: 'menu.002', name: 'Caprese Salad', unitPrice: 950 },
  { itemId: 'menu.003', name: 'Margherita Pizza', unitPrice: 1400 },
  { itemId: 'menu.004', name: 'Seasonal Soup', unitPrice: 700 },
  { itemId: 'menu.010', name: 'Fresh Orange Juice', unitPrice: 600 },
  { itemId: 'menu.011', name: 'Sparkling Water', unitPrice: 450 },
  { itemId: 'menu.012', name: 'Espresso', unitPrice: 350 },
] as const

const CATALOG_BY_ID: Readonly<Map<string, MenuCatalogItem>> = new Map(
  MENU_CATALOG_ITEMS.map((item) => [item.itemId, item]),
)

/** Look up a menu item by its stable itemId, or undefined when unknown. */
export function findMenuItem(itemId: unknown): MenuCatalogItem | undefined {
  if (typeof itemId !== 'string') return undefined
  return CATALOG_BY_ID.get(itemId)
}