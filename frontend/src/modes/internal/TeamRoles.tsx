import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'

const ROLES = [
  {
    title: 'YOU',
    role: 'Business / GTM',
    items: [
      'Outreach to hotel owners and managers',
      'Demo calls and in-person presentations',
      'Customer conversations and follow-ups',
      'Recording feedback and requirements',
      'Sales pipeline and deal closure',
    ],
  },
  {
    title: 'FRIEND',
    role: 'Technical',
    items: [
      'Technical implementation and architecture',
      'Deployment and infrastructure',
      'Bug fixes and maintenance',
      'Technical support during pilot',
      'Feature development based on feedback',
    ],
  },
  {
    title: 'SHARED',
    role: 'Joint',
    items: [
      'Product direction decisions',
      'Pilot feedback review',
      'What gets built next',
      'Pricing and packaging',
      'Go-to-market strategy',
    ],
  },
]

export function TeamRoles() {
  return (
    <section className="mode-page">
      <PageHeader
        kicker="Internal"
        title="Team Roles"
        subtitle="Who does what. Internal reference only."
      />

      {ROLES.map((section) => (
        <Card key={section.title} title={`${section.title} — ${section.role}`}>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ))}
    </section>
  )
}
