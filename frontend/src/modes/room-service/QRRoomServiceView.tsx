import { useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useModeSubmit } from '@/hooks/useModeSubmit'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { SuccessState } from '@/components/state/SuccessState'
import { ErrorState } from '@/components/state/ErrorState'
import { EmptyState } from '@/components/state/EmptyState'
import { MODES } from '@/modes/modeRegistry'
import { MENU, cartTotal } from '@/modes/room-service/menu'
import type { CartLine } from '@/modes/room-service/menu'
import { formatPrice } from '@/utils/format'
import type { RoomServiceRequest } from '@/api/types'

const FILTERS = [
  { id: 'all', label: 'All items', icon: 'grid' },
  { id: 'food', label: 'Food', icon: 'utensils' },
  { id: 'drink', label: 'Drinks', icon: 'sparkles' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

/** QR_ROOM_SERVICE mode: browse a mock menu and place an order. */
export function QRRoomServiceView() {
  const mode = MODES.QR_ROOM_SERVICE
  const { result, run, reset } = useModeSubmit(mode.id)
  const [filter, setFilter] = useState<FilterId>('all')
  const [roomNumber, setRoomNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])

  const visibleItems = MENU.filter((item) => filter === 'all' || item.category === filter)
  const total = cartTotal(cart)

  function addItem(itemId: string) {
    const item = MENU.find((m) => m.itemId === itemId)
    if (!item) return
    setCart((current) => {
      const existing = current.find((line) => line.itemId === itemId)
      if (existing) {
        return current.map((line) =>
          line.itemId === itemId ? { ...line, quantity: line.quantity + 1 } : line,
        )
      }
      return [...current, { ...item, quantity: 1 }]
    })
  }

  function setQuantity(itemId: string, quantity: number) {
    setCart((current) =>
      quantity <= 0
        ? current.filter((line) => line.itemId !== itemId)
        : current.map((line) => (line.itemId === itemId ? { ...line, quantity } : line)),
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: RoomServiceRequest = {
      guestId: '',
      sessionId: '',
      roomNumber: Number(roomNumber),
      items: cart.map(({ itemId, name, quantity, unitPrice }) => ({
        itemId,
        name,
        quantity,
        unitPrice,
      })),
      notes: notes.trim() ? notes : undefined,
      mode: 'QR_ROOM_SERVICE',
    }
    void run(payload)
  }

  function resetForm() {
    reset()
    setCart([])
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker={mode.title}
        title="In-room dining"
        subtitle="A taste of the hotel, delivered to your room. Browse the menu and place your order."
      />

      {result.phase === 'loading' ? (
        <Card>
          <LoadingState label="Placing your order..." />
        </Card>
      ) : null}

      {result.phase === 'success' ? (
        <Card>
          <SuccessState title="Order placed">
            <p>Your order is confirmed and will be prepared right away.</p>
            <p className="muted">
              Order total: {formatPrice(total)} - Request ID: {result.response.requestId}
            </p>
            <div className="state__actions">
              <Button variant="secondary" onClick={resetForm}>
                Place another order
              </Button>
            </div>
          </SuccessState>
        </Card>
      ) : null}

      {result.phase === 'error' ? (
        <Card>
          <ErrorState title="Your order could not be placed" message={result.error.message}>
            <div className="state__actions">
              <Button variant="secondary" onClick={reset}>
                Try again
              </Button>
            </div>
          </ErrorState>
        </Card>
      ) : null}

      {result.phase === 'idle' ? (
        <div className="grid grid--2col">
          <Card title="Menu" description="Choose from our in-room selections.">
            <div className="filter-row" role="group" aria-label="Menu category filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={['filter-chip', filter === f.id ? 'is-selected' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  <Icon name={f.icon} size={16} />
                  <span>{f.label}</span>
                </button>
              ))}
            </div>

            <ul className="menu-list">
              {visibleItems.map((item) => {
                const inCart = cart.find((line) => line.itemId === item.itemId)
                return (
                  <li key={item.itemId} className="menu-list__item">
                    <div className="menu-list__info">
                      <p className="menu-list__name">{item.name}</p>
                      <p className="menu-list__desc">{item.description}</p>
                      <p className="menu-list__price">{formatPrice(item.unitPrice)}</p>
                    </div>
                    <div className="menu-list__actions">
                      {inCart ? (
                        <span className="added-badge" role="status">
                          <Icon name="check" size={14} />
                          <span>Added</span>
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`Add ${item.name} to order`}
                          onClick={() => addItem(item.itemId)}
                        >
                          <Icon name="plus" size={14} />
                          <span>Add</span>
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card title="Your order" description="Review your selection before submitting.">
            {cart.length === 0 ? (
              <EmptyState
                title="Your order is empty"
                message="Add items from the menu to start your order."
              >
                <Button variant="secondary" onClick={() => setFilter('all')}>
                  Browse the menu
                </Button>
              </EmptyState>
            ) : (
              <form onSubmit={onSubmit} className="form">
                <ul className="cart-list">
                  {cart.map((line) => (
                    <li key={line.itemId} className="cart-list__item">
                      <div className="cart-list__info">
                        <p className="cart-list__name">{line.name}</p>
                        <QuantityStepper
                          name={line.name}
                          value={line.quantity}
                          onChange={(q) => setQuantity(line.itemId, q)}
                        />
                      </div>
                      <span className="cart-list__total">
                        {formatPrice(line.unitPrice * line.quantity)}
                      </span>
                      <button
                        type="button"
                        className="cart-list__remove"
                        aria-label={`Remove ${line.name} from order`}
                        onClick={() => setQuantity(line.itemId, 0)}
                      >
                        <Icon name="minus" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="cart-list__total-row">
                  <span>Subtotal</span>
                  <strong>{formatPrice(total)}</strong>
                </div>

                <Input
                  name="roomNumber"
                  label="Room number"
                  type="number"
                  min={1}
                  required
                  placeholder="e.g. 214"
                  hint="Where should we deliver?"
                  value={roomNumber}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRoomNumber(event.target.value)
                  }
                />
                <Textarea
                  name="notes"
                  label="Order notes (optional)"
                  maxLength={500}
                  placeholder="e.g. no onions, extra napkins"
                  value={notes}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)}
                />
                <div className="form__actions">
                  <Button type="submit">Place order</Button>
                </div>
                <p className="muted">
                  Prototype: routes to future POST /api/room-service (ROOM_SERVICE workflow). Not
                  connected.
                </p>
              </form>
            )}
          </Card>
        </div>
      ) : null}
    </section>
  )
}