import { useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SuccessState } from '@/components/state/SuccessState'
import { ErrorState } from '@/components/state/ErrorState'
import { LoadingState } from '@/components/state/LoadingState'

const STORAGE_KEY = 'hotel-internal-feedback'

interface FeedbackEntry {
  id: string
  hotelName: string
  contactName: string
  whatWorked: string
  whatFrustrated: string
  whatMissing: string
  whatWouldPayFor: string
  createdAt: string
}

function loadFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveFeedback(entries: FeedbackEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export function FeedbackCapture() {
  const [entries, setEntries] = useState<FeedbackEntry[]>(loadFeedback)
  const [phase, setPhase] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [hotelName, setHotelName] = useState('')
  const [contactName, setContactName] = useState('')
  const [whatWorked, setWhatWorked] = useState('')
  const [whatFrustrated, setWhatFrustrated] = useState('')
  const [whatMissing, setWhatMissing] = useState('')
  const [whatWouldPayFor, setWhatWouldPayFor] = useState('')

  function resetForm() {
    setHotelName('')
    setContactName('')
    setWhatWorked('')
    setWhatFrustrated('')
    setWhatMissing('')
    setWhatWouldPayFor('')
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPhase('loading')

    try {
      const entry: FeedbackEntry = {
        id: crypto.randomUUID(),
        hotelName: hotelName.trim(),
        contactName: contactName.trim(),
        whatWorked: whatWorked.trim(),
        whatFrustrated: whatFrustrated.trim(),
        whatMissing: whatMissing.trim(),
        whatWouldPayFor: whatWouldPayFor.trim(),
        createdAt: new Date().toISOString(),
      }
      const updated = [entry, ...entries]
      setEntries(updated)
      saveFeedback(updated)
      resetForm()
      setPhase('success')
    } catch {
      setPhase('error')
    }
  }

  function deleteEntry(id: string) {
    const updated = entries.filter((e) => e.id !== id)
    setEntries(updated)
    saveFeedback(updated)
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker="Internal"
        title="Feedback Capture"
        subtitle="Record hotel owner/staff feedback after pilot conversations."
      />

      {phase === 'loading' ? (
        <Card>
          <LoadingState label="Saving..." />
        </Card>
      ) : null}

      {phase === 'success' ? (
        <Card>
          <SuccessState title="Feedback recorded">
            <p>Your feedback entry has been saved locally.</p>
            <div className="state__actions">
              <Button variant="secondary" onClick={() => setPhase('idle')}>
                Record another
              </Button>
            </div>
          </SuccessState>
        </Card>
      ) : null}

      {phase === 'error' ? (
        <Card>
          <ErrorState title="Error" message="Something went wrong. Please try again." />
        </Card>
      ) : null}

      {phase === 'idle' ? (
        <div className="grid">
          <Card title="Record feedback" description="After a conversation with a hotel owner or staff member.">
            <form onSubmit={onSubmit} className="form">
              <Input
                name="hotelName"
                label="Hotel / property name"
                required
                placeholder="e.g. Demo Hotel"
                value={hotelName}
                onChange={(e) => setHotelName(e.target.value)}
              />
              <Input
                name="contactName"
                label="Contact name"
                required
                placeholder="e.g. Front Desk Manager"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
              <Textarea
                name="whatWorked"
                label="What worked?"
                placeholder="What did they like or find useful?"
                value={whatWorked}
                onChange={(e) => setWhatWorked(e.target.value)}
              />
              <Textarea
                name="whatFrustrated"
                label="What frustrated you?"
                placeholder="What caused friction or confusion?"
                value={whatFrustrated}
                onChange={(e) => setWhatFrustrated(e.target.value)}
              />
              <Textarea
                name="whatMissing"
                label="What was missing?"
                placeholder="What features or capabilities were expected but absent?"
                value={whatMissing}
                onChange={(e) => setWhatMissing(e.target.value)}
              />
              <Textarea
                name="whatWouldPayFor"
                label="What would make you keep paying for this?"
                placeholder="What would justify the ongoing cost?"
                value={whatWouldPayFor}
                onChange={(e) => setWhatWouldPayFor(e.target.value)}
              />
              <div className="form__actions">
                <Button type="submit">Save feedback</Button>
              </div>
            </form>
          </Card>

          {entries.length > 0 ? (
            <Card title={`Recorded feedback (${entries.length})`} description="Stored locally in your browser.">
              {entries.map((entry) => (
                <div key={entry.id} className="card" style={{ marginBottom: '1rem' }}>
                  <div className="card__body">
                    <h4>{entry.hotelName}</h4>
                    <p className="muted">{entry.contactName} &middot; {new Date(entry.createdAt).toLocaleDateString()}</p>
                    {entry.whatWorked ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>What worked:</strong>
                        <p>{entry.whatWorked}</p>
                      </div>
                    ) : null}
                    {entry.whatFrustrated ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>What frustrated:</strong>
                        <p>{entry.whatFrustrated}</p>
                      </div>
                    ) : null}
                    {entry.whatMissing ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>What was missing:</strong>
                        <p>{entry.whatMissing}</p>
                      </div>
                    ) : null}
                    {entry.whatWouldPayFor ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <strong>Would keep paying for:</strong>
                        <p>{entry.whatWouldPayFor}</p>
                      </div>
                    ) : null}
                    <div style={{ marginTop: '0.75rem' }}>
                      <Button variant="danger" size="sm" onClick={() => deleteEntry(entry.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
