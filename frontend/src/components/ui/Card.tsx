import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly title?: string
  readonly description?: string
  readonly children: ReactNode
  readonly footer?: ReactNode
}

/** Shared content card. */
export function Card({ title, description, children, footer, className, ...rest }: CardProps) {
  return (
    <div className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {title || description ? (
        <header className="card__header">
          {title ? <h3 className="card__title">{title}</h3> : null}
          {description ? <p className="card__description">{description}</p> : null}
        </header>
      ) : null}
      <div className="card__body">{children}</div>
      {footer ? <footer className="card__footer">{footer}</footer> : null}
    </div>
  )
}