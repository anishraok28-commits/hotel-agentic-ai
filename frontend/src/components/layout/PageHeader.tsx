import type { ReactNode } from 'react'

export interface PageHeaderProps {
  readonly kicker?: string
  readonly title: string
  readonly subtitle?: string
  readonly children?: ReactNode
}

/** Shared page header consistent across all four modes. */
export function PageHeader({ kicker, title, subtitle, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      {kicker ? <p className="page-header__kicker">{kicker}</p> : null}
      <h1 className="page-header__title">{title}</h1>
      {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
      {children ? <div className="page-header__actions">{children}</div> : null}
    </header>
  )
}