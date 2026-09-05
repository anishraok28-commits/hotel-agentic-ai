import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPolicy } from './PrivacyPolicy'
import { TermsOfService } from './TermsOfService'
import { PilotChecklist } from './PilotChecklist'
import { TeamRoles } from './TeamRoles'
import { BusinessReadiness } from './BusinessReadiness'

function renderPage(Component: React.FC) {
  return render(
    <MemoryRouter>
      <Component />
    </MemoryRouter>,
  )
}

describe('PrivacyPolicy', () => {
  it('renders the heading and key sections', () => {
    renderPage(PrivacyPolicy)
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/What this application does/)).toBeInTheDocument()
    expect(screen.getByText(/What we do not do/)).toBeInTheDocument()
    expect(screen.getByText(/Back to home/)).toBeInTheDocument()
  })

  it('contains correct room number and order data collection text', () => {
    renderPage(PrivacyPolicy)
    expect(screen.getByText(/room number/i)).toBeInTheDocument()
    expect(screen.getByText(/Room service orders/)).toBeInTheDocument()
    expect(screen.getByText(/Late checkout requests/)).toBeInTheDocument()
  })

  it('does not claim GDPR or other compliance certifications', () => {
    renderPage(PrivacyPolicy)
    expect(screen.queryByText(/GDPR/)).not.toBeInTheDocument()
    expect(screen.queryByText(/PCI DSS/)).not.toBeInTheDocument()
    expect(screen.queryByText(/SOC 2/)).not.toBeInTheDocument()
  })
})

describe('TermsOfService', () => {
  it('renders the heading and disclaimer', () => {
    renderPage(TermsOfService)
    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText(/basic draft/)).toBeInTheDocument()
    expect(screen.getByText(/not legal advice/)).toBeInTheDocument()
  })

  it('contains key terms sections', () => {
    renderPage(TermsOfService)
    expect(screen.getByText(/Acceptance of terms/)).toBeInTheDocument()
    expect(screen.getByText(/Order accuracy/)).toBeInTheDocument()
    expect(screen.getByText(/Limitation of liability/)).toBeInTheDocument()
  })
})

describe('PilotChecklist', () => {
  it('renders the heading and all sections', () => {
    renderPage(PilotChecklist)
    expect(screen.getByRole('heading', { name: 'Pilot Readiness Checklist' })).toBeInTheDocument()
    expect(screen.getByText('TECHNICAL')).toBeInTheDocument()
    expect(screen.getByText('LIVE SMOKE TEST')).toBeInTheDocument()
    expect(screen.getByText('BUSINESS / PILOT')).toBeInTheDocument()
  })

  it('shows checked items as completed', () => {
    renderPage(PilotChecklist)
    expect(screen.getByText('121/121 frontend tests passing')).toBeInTheDocument()
    expect(screen.getByText('238/238 backend tests passing')).toBeInTheDocument()
  })

  it('shows unchecked items as pending', () => {
    renderPage(PilotChecklist)
    expect(screen.getByText('QR session recovery tested on a real phone')).toBeInTheDocument()
    expect(screen.getByText('Privacy Policy published at /privacy')).toBeInTheDocument()
  })
})

describe('TeamRoles', () => {
  it('renders the heading and all roles', () => {
    renderPage(TeamRoles)
    expect(screen.getByRole('heading', { name: 'Team Roles' })).toBeInTheDocument()
    expect(screen.getByText(/YOU — Business/)).toBeInTheDocument()
    expect(screen.getByText(/FRIEND — Technical/)).toBeInTheDocument()
    expect(screen.getByText(/SHARED — Joint/)).toBeInTheDocument()
  })

  it('lists key responsibilities', () => {
    renderPage(TeamRoles)
    expect(screen.getByText(/Outreach to hotel owners/)).toBeInTheDocument()
    expect(screen.getByText(/Technical implementation/)).toBeInTheDocument()
    expect(screen.getByText(/Product direction decisions/)).toBeInTheDocument()
  })
})

describe('BusinessReadiness', () => {
  it('renders the heading and disclaimer', () => {
    renderPage(BusinessReadiness)
    expect(screen.getByRole('heading', { name: 'Business Readiness Notes' })).toBeInTheDocument()
    expect(screen.getByText(/To confirm with CA \/ lawyer before production/)).toBeInTheDocument()
  })

  it('lists all required business items', () => {
    renderPage(BusinessReadiness)
    expect(screen.getByText(/Business \/ entity registration/)).toBeInTheDocument()
    expect(screen.getByText(/GST \/ tax registration/)).toBeInTheDocument()
    expect(screen.getByText(/Invoicing setup/)).toBeInTheDocument()
    expect(screen.getByText(/Payment collection/)).toBeInTheDocument()
    expect(screen.getByText(/Cross-border payment/)).toBeInTheDocument()
    expect(screen.getByText(/CA \/ legal consultation/)).toBeInTheDocument()
    expect(screen.getByText(/Final legal review of Privacy Policy/)).toBeInTheDocument()
    expect(screen.getByText(/Final legal review of Terms of Service/)).toBeInTheDocument()
  })

  it('does not claim any items are completed', () => {
    renderPage(BusinessReadiness)
    expect(screen.getByText(/None of the above items are completed/)).toBeInTheDocument()
  })
})
