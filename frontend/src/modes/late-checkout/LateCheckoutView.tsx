import { useState, useEffect } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useModeSubmit } from '@/hooks/useModeSubmit'
import { useGuestContext } from '@/context/GuestContext'
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
  const guestCtx = useGuestContext()
  const [searchParams] = useSearchParams()
  const qrTokenFromUrl = searchParams.get('token') ?? ''

  // Use verified room and token from GuestContext only (never from URL room param)
  const verifiedRoom = guestCtx.roomNumber
  const qrToken = guestCtx.qrToken || qrTokenFromUrl
  const initialRoom = verifiedRoom ? String(verifiedRoom) : ''

  const [roomNumber, setRoomNumber] = useState(initialRoom)
  const [hours, setHours] = useState<number>(2)

  // When context changes, update room number
  useEffect(() => {
    if (verifiedRoom) {
      setRoomNumber(String(verifiedRoom))
    }
  }, [verifiedRoom])

  // If the backend returned new session credentials after recovery, persist them.
  useEffect(() => {
    if (result.phase === 'success') {
      const respData = result.response.data as Record<string, unknown> | undefined
      if (respData && typeof respData.guestId === 'string' && typeof respData.sessionId === 'string') {
        guestCtx.updateSession(respData.guestId, respData.sessionId)
      }
    }
  }, [result, guestCtx])

  const selected = LATE_CHECKOUT_OPTIONS.find((o) => o.hours === hours) ?? LATE_CHECKOUT_OPTIONS[0]

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: LateCheckoutRequest = {
      guestId: guestCtx.guestId,
      sessionId: guestCtx.sessionId,
      roomNumber: Number(roomNumber),
      requestedTime: buildRequestedTime(hours),
      qrToken: qrToken || undefined,
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
                hint={verifiedRoom ? 'Room verified from QR code' : 'So the front desk can attach your request.'}
                value={roomNumber}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setRoomNumber(event.target.value)
                }
                readOnly={!!verifiedRoom}
                disabled={!!verifiedRoom}
              />
              <div className="form__actions">
                <Button type="submit">Request late checkout</Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </section>
  )
}

function buildRequestedTime(hours: number): string {
  const now = new Date()
  const requested = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0, 0),
  )
  requested.setUTCHours(requested.getUTCHours() + hours)
  if (requested.getTime() <= now.getTime()) {
    requested.setUTCDate(requested.getUTCDate() + 1)
  }
  return requested.toISOString()
}