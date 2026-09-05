import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'

export function BusinessReadiness() {
  return (
    <section className="mode-page">
      <PageHeader
        kicker="Internal"
        title="Business Readiness Notes"
        subtitle="Non-coding items that must be handled separately. Not exposed in guest navigation."
      />

      <Card title="Legal & Business Setup" description="To confirm with CA / lawyer before production use.">
        <ul className="checklist">
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>Business / entity registration as appropriate [To confirm with CA]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>GST / tax registration and compliance [To confirm with CA]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>Invoicing setup for hotel clients [To confirm with CA]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>Payment collection method and gateway [To confirm with CA]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>Cross-border payment considerations [To confirm with CA]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>CA / legal consultation on business structure [To confirm with CA]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>Final legal review of Privacy Policy [To confirm with lawyer]</span>
          </li>
          <li className="checklist__item">
            <span className="checklist__checkbox">○</span>
            <span>Final legal review of Terms of Service [To confirm with lawyer]</span>
          </li>
        </ul>
      </Card>

      <Card title="Important note">
        <p>
          None of the above items are completed. Do not assume any legal, tax, or
          compliance status. All items marked &quot;To confirm with CA&quot; or
          &quot;To confirm with lawyer&quot; must be verified with qualified
          professionals before the pilot goes live.
        </p>
      </Card>
    </section>
  )
}
