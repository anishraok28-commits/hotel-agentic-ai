import type { ReactNode } from 'react'
import { Icon } from '@/components/icon/Icon'

export interface SuccessStateProps {
  readonly title: string
  readonly children?: ReactNode
}

/** Shared success state. */
export function SuccessState({ title, children }: SuccessStateProps) {
  return (
    <div className="state state--success" role="status" aria-live="polite">
      <span className="state__icon">
        <Icon name="sparkles" size={28} />
      </span>
      <h3>{title}</h3>
      {children ? <div className="state__body">{children}</div> : null}
    </div>
  )
}