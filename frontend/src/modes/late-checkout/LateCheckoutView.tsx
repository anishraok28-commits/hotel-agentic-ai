import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useModeSubmit } from '@/hooks/useModeSubmit'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingState } from '@/components/state/LoadingState'
import { SuccessState } from '@/components/state/SuccessState'
import { ErrorState } from '@/components/state/ErrorState'
import { MODES } from '@/modes/modeRegistry'
import { LATE_CHECKOUT_OPTIONS } from '@/modes/late-checkout/lateCheckoutOptions'
import type { LateCheckoutRequest } from '@/api/types'

/** LATE_CHECKOUT mode: choose an extension time and submit the request. */
export function LateCheckoutView() {
  const mode = MODES.LATE_CHECKOUT
  const { result, run, reset } = useModeSubmit(mode.id)
  const [roomNumber, setRoomNumber] = useState('')
  const [hours, setHours] = useState<number>(2)

  const selected = LATE_CHECKOUT_OPTIONS.find((o) => o.hours === hours) ?? LATE_CHECKOUT_OPTIONS[0]

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: LateCheckoutRequest = {
      guestId: '',
      sessionId: '',
      roomNumber: Number(roomNumber),
      requestedTime: buildRequestedTime(hours),
      mode: 'LATE_CHECKOUT',
    }
    void run(payload)
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker={mode.title}
        title="Extend your checkout"
        subtitle="Standard checkout is 11:00 AM. Choose how much longer you need in your room."
      />

      {result.phase === 'loading' ? (
        <Card>
          <LoadingState label="Submitting your late checkout request..." />
        </Card>
      ) : null}

      {result.phase === 'success' ? (
        <Card>
          <SuccessState title="Late checkout requested">
            <p>
              You are set to check out {selected.timeLabel}. We will confirm shortly at the front
              desk.
            </p>
            <p className="muted">Request ID: {result.response.requestId}</p>
            <div className="state__actions">
              <Button variant="secondary" onClick={reset}>
                Request another change
              </Button>
            </div>
          </SuccessState>
        </Card>
      ) : null}

      {result.phase === 'error' ? (
        <Card>
          <ErrorState title="We could not submit your request" message={result.error.message}>
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
          <Card title="Choose your time" description="All options extend past standard checkout.">
            <div className="radio-group" role="radiogroup" aria-label="Late checkout time options">
              {LATE_CHECKOUT_OPTIONS.map((option) => {
                const selectedOption = hours === option.hours
                return (
                  <label
                    key={option.hours}
                    className={['radio-card', selectedOption ? 'is-selected' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <input
                      type="radio"
                      name="extension"
                      value={option.hours}
                      checked={selectedOption}
                      onChange={() => setHours(option.hours)}
                    />
                    <span className="radio-card__copy">
                      <span className="radio-card__title">{option.label}</span>
                      <span className="radio-card__detail">{option.detail}</span>
                    </span>
                    <span className="radio-card__time">{option.timeLabel}</span>
                  </label>
                )
              })}
            </div>
          </Card>

          <Card title="Review your request">
            <dl className="summary-list">
              <div className="summary-list__row">
                <dt>Standard checkout</dt>
                <dd>11:00 AM</dd>
              </div>
              <div className="summary-list__row">
                <dt>Requested departure</dt>
                <dd>{selected.timeLabel}</dd>
              </div>
            </dl>

            <form onSubmit={onSubmit} className="form">
              <Input
                name="roomNumber"
                label="Room number"
                type="number"
                min={1}
                required
                placeholder="e.g. 214"
                hint="So the front desk can attach your request."
                value={roomNumber}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRoomNumber(event.target.value)
                }
              />
              <div className="form__actions">
                <Button type="submit">Request late checkout</Button>
              </div>
              <p className="muted">
                Prototype: routes to future POST /api/late-checkout (LATE_CHECKOUT workflow). Not
                connected.
              </p>
            </form>
          </Card>
        </div>
      ) : null}
    </section>
  )
}

function buildRequestedTime(hours: number): string {
  const checkout = new Date()
  checkout.setHours(11, 0, 0, 0)
  checkout.setHours(checkout.getHours() + hours)
  return checkout.toISOString()
}