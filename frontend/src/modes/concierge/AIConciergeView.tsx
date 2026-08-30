import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useModeSubmit } from '@/hooks/useModeSubmit'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { SuccessState } from '@/components/state/SuccessState'
import { ErrorState } from '@/components/state/ErrorState'
import { MODES } from '@/modes/modeRegistry'
import { PRIMARY_CATEGORIES, MORE_CATEGORIES } from '@/modes/concierge/conciergeCategories'
import type { ConciergeRequest } from '@/api/types'

const TIME_OPTIONS = [
  { value: 'any', label: 'Anytime today' },
  { value: 'morning', label: 'Morning (8 AM - 12 PM)' },
  { value: 'afternoon', label: 'Afternoon (12 PM - 5 PM)' },
  { value: 'evening', label: 'Evening (5 PM - 10 PM)' },
] as const

type TimeOfDay = (typeof TIME_OPTIONS)[number]['value']

/** AI_CONCIERGE mode: category + request form feeding the future BOOKING flow. */
export function AIConciergeView() {
  const mode = MODES.AI_CONCIERGE
  const { result, run, reset } = useModeSubmit(mode.id)
  const [roomNumber, setRoomNumber] = useState('')
  const [request, setRequest] = useState('')
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('any')
  const [category, setCategory] = useState<string | null>(null)
  const [showMore, setShowMore] = useState(false)

  const visibleCategories = showMore
    ? [...PRIMARY_CATEGORIES, ...MORE_CATEGORIES]
    : [...PRIMARY_CATEGORIES]

  function selectCategory(categoryId: string, sampleRequest: string) {
    if (categoryId === 'more-services') {
      setShowMore(true)
      return
    }
    setCategory(categoryId)
    if (sampleRequest) {
      setRequest(sampleRequest)
    }
  }

  function resetForm() {
    reset()
    setRequest('')
    setCategory(null)
    setShowMore(false)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: ConciergeRequest = {
      guestId: '',
      sessionId: '',
      roomNumber: Number(roomNumber),
      request: request.trim(),
      mode: 'AI_CONCIERGE',
    }
    void run(payload)
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker={mode.title}
        title="Your concierge"
        subtitle="Tell us how we can make your stay more memorable. Pick a category or describe anything you need."
      />

      {result.phase === 'loading' ? (
        <Card>
          <LoadingState label="Sending your request to the concierge..." />
        </Card>
      ) : null}

      {result.phase === 'success' ? (
        <Card>
          <SuccessState title="Request received">
            <p>
              Our concierge team has your request. We will follow up directly - usually within a few
              minutes.
            </p>
            <p className="muted">Request ID: {result.response.requestId}</p>
            <div className="state__actions">
              <Button variant="secondary" onClick={resetForm}>
                Start another request
              </Button>
            </div>
          </SuccessState>
        </Card>
      ) : null}

      {result.phase === 'error' ? (
        <Card>
          <ErrorState title="We could not send your request" message={result.error.message}>
            <div className="state__actions">
              <Button variant="secondary" onClick={reset}>
                Try again
              </Button>
            </div>
          </ErrorState>
        </Card>
      ) : null}

      {result.phase === 'idle' ? (
        <div className="grid">
          <Card>
            <div className="welcome">
              <span className="welcome__icon">
                <Icon name="sparkles" size={26} />
              </span>
              <div>
                <h2>Welcome to {mode.title}</h2>
                <p className="muted">
                  From room help to local highlights, we handle the details so you can relax.
                </p>
              </div>
            </div>
          </Card>

          <Card title="What do you need help with?">
            <div className="category-grid" role="group" aria-label="Assistance categories">
              {visibleCategories.map((item) => {
                const selected = category === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={['category-chip', selected ? 'is-selected' : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={selected}
                    onClick={() => selectCategory(item.id, item.sampleRequest)}
                  >
                    <Icon name={item.icon} size={18} />
                    <span>{item.label}</span>
                  </button>
                )
              })}
              {showMore ? (
                <button
                  type="button"
                  className="category-chip"
                  onClick={() => {
                    setShowMore(false)
                    setCategory(null)
                  }}
                >
                  <Icon name="minus" size={18} />
                  <span>Less</span>
                </button>
              ) : null}
            </div>
          </Card>

          <Card title="Tell us the details">
            <form onSubmit={onSubmit} className="form">
              <Input
                name="roomNumber"
                label="Room number"
                type="number"
                min={1}
                required
                placeholder="e.g. 214"
                hint="So we know where to find you."
                value={roomNumber}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRoomNumber(event.target.value)
                }
              />
              <Textarea
                name="request"
                label="Your request"
                required
                placeholder="e.g. Book a table for two near the hotel tonight."
                maxLength={2000}
                hint={`${request.length}/2000 characters`}
                value={request}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                  setRequest(event.target.value)
                }
              />
              <Select
                name="timeOfDay"
                label="Preferred time"
                options={TIME_OPTIONS}
                value={timeOfDay}
                onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                  setTimeOfDay(event.target.value as TimeOfDay)
                }
              />
              <div className="form__actions">
                <Button type="submit">Send to concierge</Button>
              </div>
              <p className="muted">
                Prototype: routes to future POST /api/concierge (BOOKING workflow). Not connected.
              </p>
            </form>
          </Card>
        </div>
      ) : null}
    </section>
  )
}
