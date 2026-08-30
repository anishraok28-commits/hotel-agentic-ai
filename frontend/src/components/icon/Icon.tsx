import type { ReactNode } from 'react'

interface IconProps {
  readonly name: string
  readonly size?: number
  readonly className?: string
}

/** Icon path map used by the shared Icon component. */
const ICON_PATHS: Record<string, ReactNode> = {
  sparkles: (
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16z" />
  ),
  utensils: (
    <path d="M6 2v8h2v12h2V10h2V2H6zM17 2c-1.7 0-3 2-3 4.5S15.3 11 17 11v11h2V2h-2z" />
  ),
  clock: (
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 5v5.6l4 2.4-1 1.6-5-3V7h2z" />
  ),
  grid: (
    <path d="M4 3h7v7H4V3zm9 0h7v7h-7V3zM4 12h7v9H4v-9zm9 0h7v9h-7v-9z" />
  ),
  map: (
    <path d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z" />
  ),
  car: (
    <path d="M18.9 6.6l-1.1-3.1A2 2 0 0015.9 2H8.1a2 2 0 00-1.9 1.5L5.1 6.6C3.4 7.3 2 9.1 2 11v6a2 2 0 002 2h1v1h4v-1h6v1h4v-1h1a2 2 0 002-2v-6c0-1.9-1.4-3.7-3.1-4.4zM8.1 4h7.8l.8 2.3H7.3L8.1 4zM6.5 15.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm11 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zM4 11h16v2H4v-2z" />
  ),
  flower: (
    <path d="M12 12a4 4 0 100-8 4 4 0 0008zm0-6a2 2 0 010 4 2 2 0 010-4zm-4.2 6.2a4 4 0 105.6 5.7 4 4 0 10-1.4-5.7 4 4 0 10-4.2 0zm4.2 5.3a2 2 0 010-4 2 2 0 010 4zm6.2-5.3a4 4 0 101.4 5.7 4 4 0 10-1.4-5.7zm-1.4 5.7l.7.7-.7.7a2 2 0 11-.7-.7l.7-.7z" />
  ),
  ticket: (
    <path d="M4 6h16a2 2 0 012 2v3a2 2 0 000 4v3a2 2 0 01-2 2H4a2 2 0 01-2-2v-3a2 2 0 000-4V8a2 2 0 012-2zm12 3.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-8 1.5h6v-2H8v2z" />
  ),
  bed: (
    <path d="M2 5v14h2v-3h16v3h2V11a3 3 0 00-3-3H11a3 3 0 00-3 3v1H4V5H2zm16 7v-1a1 1 0 00-1-1h-6a1 1 0 00-1 1v1h2-7v-1H4v3h16v-2h-2z" />
  ),
  check: (
    <path d="M9 16.2l-3.5-3.5L4 14.2 9 19.2 20 8.2l-1.4-1.4L9 16.2z" />
  ),
  plus: <path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z" />,
  minus: <path d="M5 11h14v2H5v-2z" />,
  chevronRight: <path d="M9 6l6 6-6 6-1.4-1.4L12.2 12 7.6 7.4 9 6z" />,
  alert: (
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v6h-2V7zm0 8h2v2h-2v-2z" />
  ),
  info: (
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v2h-2V7zm0 4h2v6h-2v-6z" />
  ),
  broom: (
    <path d="M16.2 3.2l4.6 4.6-1.4 1.4-1-1V12c0 1.1-.9 2-2 2h-1v5c0 .6-.4 1-1 1s-1-.4-1-1v-5h-2v5c0 .6-.4 1-1 1s-1-.4-1-1v-5H7.6c-1.1 0-2-.9-2-2V8.2l-1 1L3.2 7.8l4.6-4.6L12 3.4l4.2-.2zM7 12V9.4l5-5 5 5V12H7z" />
  ),
  compass: (
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm-4.3-6.3l4.8-1.2 1.2-4.8 1.5 4.5-4.5 1.5z" />
  ),
  creditCard: (
    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V10h16v6zm0-10H4V6h16v2zM6 14h4v2H6v-2z" />
  ),
}

/** Inline SVG icon set keyed by symbol names from the mode registry. */
export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      data-icon={name}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}