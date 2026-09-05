import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Link } from 'react-router-dom'

export function TermsOfService() {
  return (
    <section className="mode-page">
      <PageHeader
        title="Terms of Service"
        subtitle="Hotel Agentic AI — Guest Operations Platform"
      />

      <Card>
        <div className="legal-content">
          <p className="muted">Last updated: September 2026</p>

          <p>
            <strong>Note:</strong> This is a basic draft Terms of Service for the pilot
            phase. It is not legal advice and has not been reviewed by a lawyer. Final
            terms should be reviewed by legal counsel before production use.
          </p>

          <h3>1. Acceptance of terms</h3>
          <p>
            By accessing or using the Hotel Agentic AI platform (the &quot;Service&quot;)
            provided through a QR code or URL supplied by your hotel, you agree to these
            terms.
          </p>

          <h3>2. What the Service provides</h3>
          <p>
            The Service allows hotel guests to place room service orders, request late
            checkout, and interact with an AI-powered concierge. The Service is provided
            by the hotel and its technology partners for the duration of your stay.
          </p>

          <h3>3. Guest responsibilities</h3>
          <ul>
            <li>You must provide accurate room information for your requests to be fulfilled.</li>
            <li>You are responsible for any orders placed through your room&apos;s QR code session.</li>
            <li>You must not attempt to access, tamper with, or misuse the Service.</li>
          </ul>

          <h3>4. Order accuracy</h3>
          <p>
            Room service orders are fulfilled by hotel staff based on the information
            you provide. The platform is not responsible for errors in orders that
            result from incorrect information entered by the guest.
          </p>

          <h3>5. Availability</h3>
          <p>
            The Service may be temporarily unavailable due to maintenance, technical
            issues, or circumstances beyond our control. The hotel will make reasonable
            efforts to maintain availability.
          </p>

          <h3>6. Limitation of liability</h3>
          <p>
            The Service is provided &quot;as is&quot; without warranties of any kind.
            The hotel and its technology providers are not liable for any indirect,
            incidental, or consequential damages arising from your use of the Service.
          </p>

          <h3>7. Changes to these terms</h3>
          <p>
            These terms may be updated from time to time. Continued use of the Service
            after changes constitutes acceptance of the updated terms.
          </p>

          <h3>8. Governing law</h3>
          <p>
            These terms are governed by the laws of the jurisdiction in which the
            hotel operates. [To confirm with lawyer]
          </p>

          <h3>9. Contact</h3>
          <p>
            For questions about these terms, please contact the hotel front desk.
          </p>

          <div style={{ marginTop: '2rem' }}>
            <Link to="/">Back to home</Link>
          </div>
        </div>
      </Card>
    </section>
  )
}
