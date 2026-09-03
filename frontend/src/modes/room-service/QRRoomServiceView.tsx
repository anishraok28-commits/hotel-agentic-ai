import { useState, useCallback, useEffect } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useModeSubmit } from '@/hooks/useModeSubmit'
import { useGuestContext } from '@/context/GuestContext'
import { checkOrderStatus } from '@/api/mockTransport'
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
import type { RoomServiceRequest, OrderDetails, OrderStatus, RoomServiceItem } from '@/api/types'

const FILTERS = [
  { id: 'all', label: 'All items', icon: 'grid' },
  { id: 'food', label: 'Food', icon: 'utensils' },
  { id: 'drink', label: 'Drinks', icon: 'sparkles' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  NEW: 'Order received',
  PREPARING: 'Being prepared',
  READY: 'Ready for delivery',
  DELIVERED: 'Delivered',
}

const ORDER_STORAGE_KEY = 'qr-room-service-active-order'

function readStoredOrder(): { orderData: OrderDetails; auth: AuthContext } | null {
  try {
    const raw = sessionStorage.getItem(ORDER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof parsed.orderId !== 'string' ||
      typeof parsed.status !== 'string' ||
      !Array.isArray(parsed.items) ||
      typeof parsed.total !== 'number' ||
      typeof parsed.guestId !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.qrToken !== 'string'
    ) return null
    return {
      orderData: {
        orderId: parsed.orderId,
        status: parsed.status as OrderStatus,
        roomNumber: (parsed.roomNumber as number) ?? 0,
        items: parsed.items as RoomServiceItem[],
        total: parsed.total,
        createdAt: (parsed.createdAt as string) ?? '',
      },
      auth: {
        guestId: parsed.guestId,
        sessionId: parsed.sessionId,
        qrToken: parsed.qrToken,
      },
    }
  } catch {
    return null
  }
}

interface AuthContext {
  guestId: string
  sessionId: string
  qrToken: string
}

function extractOrderData(
  response: { data?: Record<string, unknown> },
): OrderDetails | null {
  const d = response.data
  if (!d || typeof d !== 'object') return null
  const orderId = d.orderId
  const status = d.status
  const items = d.items
  const total = d.total
  if (typeof orderId !== 'string' || typeof status !== 'string') return null
  if (!Array.isArray(items) || typeof total !== 'number') return null
  return {
    orderId,
    status: status as OrderStatus,
    roomNumber: (d.roomNumber as number) ?? 0,
    items: items as RoomServiceItem[],
    total,
    createdAt: (d.createdAt as string) ?? '',
  }
}

/** QR_ROOM_SERVICE mode: browse a menu and place an order. */
export function QRRoomServiceView() {
  const mode = MODES.QR_ROOM_SERVICE
  const { result, run, reset } = useModeSubmit(mode.id)
  const guestCtx = useGuestContext()
  const [searchParams] = useSearchParams()
  const qrTokenFromUrl = searchParams.get('token') ?? ''

  // Use verified room and token from GuestContext only (never from URL room param)
  const verifiedRoom = guestCtx.roomNumber
  const qrToken = guestCtx.qrToken || qrTokenFromUrl
  const initialRoom = verifiedRoom ? String(verifiedRoom) : ''

  const [filter, setFilter] = useState<FilterId>('all')
  const [roomNumber, setRoomNumber] = useState(initialRoom)
  const [notes, setNotes] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [confirming, setConfirming] = useState(false)
  const [orderData, setOrderData] = useState<OrderDetails | null>(null)
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [auth, setAuth] = useState<AuthContext | null>(null)

  // When context changes, update room number
  useEffect(() => {
    if (verifiedRoom) {
      setRoomNumber(String(verifiedRoom))
    }
  }, [verifiedRoom])

  // Restore active order from sessionStorage on mount
  useEffect(() => {
    const stored = readStoredOrder()
    if (stored) {
      setOrderData(stored.orderData)
      setOrderStatus(stored.orderData.status)
      setAuth(stored.auth)
    }
  }, [])

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
    setConfirming(true)
  }

  const handleRun = useCallback(async () => {
    setConfirming(false)
    const payload: RoomServiceRequest = {
      guestId: guestCtx.guestId,
      sessionId: guestCtx.sessionId,
      roomNumber: Number(roomNumber),
      items: cart.map(({ itemId, name, quantity, unitPrice }) => ({
        itemId,
        name,
        quantity,
        unitPrice,
      })),
      notes: notes.trim() ? notes : undefined,
      qrToken: qrToken || undefined,
      mode: 'QR_ROOM_SERVICE',
    }
    await run(payload)
  }, [run, roomNumber, cart, notes, qrToken, guestCtx.guestId, guestCtx.sessionId])

  async function refreshStatus() {
    if (!orderData) return
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await checkOrderStatus(orderData.orderId, auth ?? undefined)
      if (res.status === 'error') {
        setStatusError(res.message)
      } else {
        const s = res.data?.status
        if (typeof s === 'string') {
          setOrderStatus(s as OrderStatus)
        }
      }
    } catch {
      setStatusError('Could not check order status.')
    } finally {
      setStatusLoading(false)
    }
  }

  function resetForm() {
    reset()
    setCart([])
    setOrderData(null)
    setOrderStatus(null)
    setStatusError(null)
    setConfirming(false)
    setAuth(null)
    sessionStorage.removeItem(ORDER_STORAGE_KEY)
  }

  // When result transitions to success, extract order data
  if (result.phase === 'success' && orderData === null) {
    const extracted = extractOrderData(result.response)
    if (extracted) {
      setOrderData(extracted)
      setOrderStatus(extracted.status)
      // Persist active order and auth context for browser-refresh survival.
      // Use the React context (guestCtx) which carries the verified session
      // credentials from GuestContext, not the mockTransport module variable.
      const authCtx: AuthContext = {
        guestId: guestCtx.guestId,
        sessionId: guestCtx.sessionId,
        qrToken,
      }
      setAuth(authCtx)
      try {
        sessionStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({
          ...extracted,
          ...authCtx,
        }))
      } catch { /* storage full or unavailable */ }
    }
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

      {orderData ? (
        <Card>
          <SuccessState title="Order confirmed">
            <div className="order-confirmation">
              <div className="order-confirmation__header">
                <p className="order-confirmation__id">Order {orderData.orderId.slice(0, 8)}...</p>
                <span className="order-status-badge" data-status={orderStatus ?? orderData.status}>
                  {STATUS_LABELS[orderStatus ?? orderData.status]}
                </span>
              </div>

              <ul className="order-confirmation__items">
                {orderData.items.map((item: RoomServiceItem) => (
                  <li key={item.itemId} className="order-confirmation__item">
                    <span>{item.name} x{item.quantity}</span>
                    <span>{formatPrice(item.unitPrice * item.quantity)}</span>
                  </li>
                ))}
              </ul>

              <div className="order-confirmation__total">
                <span>Total</span>
                <strong>{formatPrice(orderData.total)}</strong>
              </div>

              <div className="order-confirmation__status-section">
                {statusLoading ? (
                  <span className="muted">Checking status...</span>
                ) : null}
                {statusError ? (
                  <p className="muted order-confirmation__status-error">{statusError}</p>
                ) : null}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={refreshStatus}
                  disabled={statusLoading}
                >
                  <Icon name="sparkles" size={14} />
                  <span>Refresh status</span>
                </Button>
              </div>

              <div className="state__actions">
                <Button variant="secondary" onClick={resetForm}>
                  Place another order
                </Button>
              </div>
            </div>
          </SuccessState>
        </Card>
      ) : null}

      {result.phase === 'success' && !orderData ? (
        <Card>
          <SuccessState title="Order placed">
            <p>Your order has been received.</p>
            <p className="muted">Request ID: {result.response.requestId}</p>
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

      {confirming ? (
        <Card>
          <div className="state state--confirm" role="dialog" aria-label="Confirm your order">
            <h3>Confirm your order</h3>
            <ul className="order-confirmation__items">
              {cart.map((line) => (
                <li key={line.itemId} className="order-confirmation__item">
                  <span>{line.name} x{line.quantity}</span>
                  <span>{formatPrice(line.unitPrice * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="order-confirmation__total">
              <span>Total</span>
              <strong>{formatPrice(total)}</strong>
            </div>
            <p className="muted">Room {roomNumber || '—'}</p>
            <div className="state__actions">
              <Button onClick={handleRun}>Confirm order</Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Go back
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {result.phase === 'idle' && !confirming ? (
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
                        <QuantityStepper
                          name={item.name}
                          value={inCart.quantity}
                          min={1}
                          onChange={(q) => setQuantity(item.itemId, q)}
                        />
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
                  hint={verifiedRoom ? 'Room verified from QR code' : 'Where should we deliver?'}
                  value={roomNumber}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setRoomNumber(event.target.value)
                  }
                  readOnly={!!verifiedRoom}
                  disabled={!!verifiedRoom}
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
                  <Button type="submit">Review order</Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      ) : null}
    </section>
  )
}
