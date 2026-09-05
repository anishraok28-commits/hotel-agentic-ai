import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Link } from 'react-router-dom'

export function PrivacyPolicy() {
  return (
    <section className="mode-page">
      <PageHeader
        title="Privacy Policy"
        subtitle="Hotel Agentic AI — Guest Operations Platform"
      />

      <Card>
        <div className="legal-content">
          <p className="muted">Last updated: September 2026</p>

          <h3>1. What this application does</h3>
          <p>
            Hotel Agentic AI is a guest operations platform used by hotels to provide
            digital services to their guests, including room service ordering, late
            checkout requests, and concierge interactions. This privacy policy explains
            what information the application may collect and why.
          </p>

          <h3>2. Information we collect</h3>
          <p>When you use this application via a QR code provided by your hotel, we may collect:</p>
          <ul>
            <li><strong>Room number</strong> — to identify which room the request is associated with.</li>
            <li><strong>Room service orders</strong> — items ordered, quantities, and any notes you include.</li>
            <li><strong>Late checkout requests</strong> — your requested checkout time.</li>
            <li><strong>Concierge inquiries</strong> — messages and requests you submit through the AI concierge.</li>
          </ul>

          <h3>3. How your information is used</h3>
          <p>Your information is used solely to:</p>
          <ul>
            <li>Fulfil your room service, late checkout, or concierge requests.</li>
            <li>Allow hotel staff to view and process your requests.</li>
            <li>Track order status so you can see updates in real time.</li>
          </ul>

          <h3>4. What we do not do</h3>
          <ul>
            <li>We do <strong>not</strong> sell your information to third parties.</li>
            <li>We do <strong>not</strong> use your information for marketing or advertising.</li>
            <li>We do <strong>not</strong> track your browsing behaviour across other websites.</li>
            <li>We do <strong>not</strong> use cookies for tracking or analytics.</li>
          </ul>

          <h3>5. Data storage</h3>
          <p>
            Your request data is stored on secure servers operated by the hotel or its
            technology provider. Session data may be stored temporarily in your browser
            to maintain your session and restore your order state if you refresh the page.
          </p>

          <h3>6. Data retention</h3>
          <p>
            Your request data is retained for the duration of your hotel stay and for a
            reasonable period afterwards for operational purposes. Data is not retained
            indefinitely.
          </p>

          <h3>7. Your rights</h3>
          <p>
            You may ask the hotel front desk to view, correct, or delete any information
            associated with your room.
          </p>

          <h3>8. Changes to this policy</h3>
          <p>
            This policy may be updated from time to time. The latest version will be
            available at this URL.
          </p>

          <h3>9. Contact</h3>
          <p>
            For questions about this privacy policy or your data, please contact the
            hotel front desk.
          </p>

          <div style={{ marginTop: '2rem' }}>
            <Link to="/">Back to home</Link>
          </div>
        </div>
      </Card>
    </section>
  )
}
