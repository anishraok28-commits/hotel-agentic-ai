/** Format an integer amount in the smallest currency unit as USD. */
export function formatPrice(value: number): string {
  return `$${(value / 100).toFixed(2)}`
}

/** Format an ISO date string into a readable booking summary line. */
export function formatRequestDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}