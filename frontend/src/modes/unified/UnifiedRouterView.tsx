import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { ROUTABLE_MODES, MODES } from '@/modes/modeRegistry'
import { Icon } from '@/components/icon/Icon'
import { Link } from 'react-router-dom'
import { useGuestContext } from '@/context/GuestContext'

/**
 * 3_IN_1_UNIFIED mode.
 *
 * A pure client-side routing/interface layer. It does NOT post any request
 * and it does NOT define a workflow. Choosing an option routes the guest to
 * one of the three existing product flows (see docs/architecture.md - 4.3).
 */
export function UnifiedRouterView() {
  const unified = MODES['3_IN_1_UNIFIED']
  const guestCtx = useGuestContext()

  return (
    <section className="mode-page">
      <PageHeader
        kicker={unified.title}
        title={guestCtx.roomNumber ? `Room ${guestCtx.roomNumber}` : 'Welcome back'}
        subtitle="Everything you need for your stay, in one place. Choose a service below."
      />

      <div className="welcome welcome--hero">
        <span className="welcome__icon">
          <Icon name="bed" size={28} />
        </span>
        <div>
          <h2>Have a wonderful stay</h2>
          <p className="muted">
            Use the concierge for recommendations, order room service, or extend your checkout -
            all from your room.
          </p>
        </div>
      </div>

      <div className="unified-grid">
        {ROUTABLE_MODES.map((mode) => (
          <Link key={mode.id} to={mode.path} className="unified-card">
            <Card title={mode.title} description={mode.description}>
              <span className="unified-card__icon">
                <Icon name={mode.icon} size={26} />
              </span>
              <span className="unified-card__cta">
                Continue
                <Icon name="chevronRight" size={16} />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}