import type { ReactNode } from 'react'

export interface ErrorStateProps {
  readonly title?: string
  readonly message: string
  readonly children?: ReactNode
}

/** Shared error state. */
export function ErrorState({
  title = 'Something went wrong',
  message,
  children,
}: ErrorStateProps) {
  return (
    <div className="state state--error" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {children ? <div className="state__body">{children}</div> : null}
    </div>
  )
}