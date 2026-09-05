import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ModeNav } from '@/components/layout/ModeNav'
import { useIsMobile } from '@/hooks/useResponsive'

export interface AppShellProps {
  readonly children: ReactNode
}

/** Shared application shell: header, nav, main content, footer. */
export function AppShell({ children }: AppShellProps) {
  const isMobile = useIsMobile()

  return (
    <div className={isMobile ? 'shell shell--mobile' : 'shell'}>
      <header className="shell__header">
        <Link className="shell__brand" to="/">
          <span className="shell__brand-mark">H</span>
          <span className="shell__brand-text">Hotel Agentic AI</span>
        </Link>
        <div className="shell__nav">{!isMobile ? <ModeNav /> : null}</div>
      </header>

      {isMobile ? (
        <div className="shell__nav-mobile">
          <ModeNav />
        </div>
      ) : null}

      <main className="shell__main">{children}</main>

      <footer className="shell__footer">
        <p>Hotel Agentic AI — Guest Operations Platform</p>
      </footer>
    </div>
  )
}