import type { ReactNode } from 'react'

export interface EmptyStateProps {
  readonly title: string
  readonly message?: string
  readonly children?: ReactNode
}

/** Shared empty state. */
export function EmptyState({ title, message, children }: EmptyStateProps) {
  return (
    <div className="state state--empty">
      <div className="state__icon">-</div>
      <h3>{title}</h3>
      {message ? <p>{message}</p> : null}
      {children ? <div className="state__actions">{children}</div> : null}
    </div>
  )
}