import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'

const CHECKLIST = [
  {
    title: 'TECHNICAL',
    items: [
      { label: 'Frontend live on Render', checked: true },
      { label: 'Backend live on Render', checked: true },
      { label: '121/121 frontend tests passing', checked: true },
      { label: '238/238 backend tests passing', checked: true },
      { label: 'Frontend typecheck passed', checked: true },
      { label: 'Frontend lint passed', checked: true },
      { label: 'Frontend build passed', checked: true },
      { label: 'Backend typecheck passed', checked: true },
      { label: 'Backend lint passed', checked: true },
      { label: 'Backend build passed', checked: true },
      { label: 'Git clean and pushed', checked: true },
    ],
  },
  {
    title: 'LIVE SMOKE TEST',
    items: [
      { label: 'QR session recovery tested on a real phone', checked: false },
      { label: 'Room-service order placed end-to-end', checked: false },
      { label: 'Staff sees the order in /staff-orders', checked: false },
      { label: 'NEW → PREPARING → READY → DELIVERED tested', checked: false },
      { label: 'Guest status updates confirmed', checked: false },
      { label: 'Polling stops after DELIVERED', checked: false },
      { label: 'Make.com resilience tested where safely possible', checked: false },
      { label: 'Late Checkout tested', checked: false },
      { label: 'Browser refresh / session recovery tested', checked: false },
    ],
  },
  {
    title: 'BUSINESS / PILOT',
    items: [
      { label: 'Privacy Policy published at /privacy', checked: false },
      { label: 'Terms of Service published at /terms', checked: false },
      { label: 'Feedback capture ready at /internal/feedback', checked: false },
      { label: 'Hotel owner/staff feedback recorded', checked: false },
      { label: 'Team roles confirmed', checked: false },
      { label: 'Outreach started', checked: false },
    ],
  },
]

export function PilotChecklist() {
  return (
    <section className="mode-page">
      <PageHeader
        kicker="Internal"
        title="Pilot Readiness Checklist"
        subtitle="Track progress toward live pilot. Not exposed in guest navigation."
      />

      {CHECKLIST.map((section) => (
        <Card key={section.title} title={section.title}>
          <ul className="checklist">
            {section.items.map((item) => (
              <li key={item.label} className="checklist__item">
                <span className={`checklist__checkbox ${item.checked ? 'checklist__checkbox--checked' : ''}`}>
                  {item.checked ? '✓' : '○'}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
