import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/** Simple 404 page shown when no route matches. */
export function NotFound() {
  return (
    <section className="mode-page">
      <PageHeader
        kicker="Page not found"
        title="404"
        subtitle="The page you are looking for does not exist or has been moved."
      />
      <Card>
        <div className="state state--error" role="status">
          <p>We could not find the page you requested.</p>
          <div className="state__actions">
            <Link to="/">
              <Button>Return to home</Button>
            </Link>
          </div>
        </div>
      </Card>
    </section>
  )
}
