import { useState, useEffect, useCallback } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { ErrorState } from '@/components/state/ErrorState'
import { EmptyState } from '@/components/state/EmptyState'
import { listAdminOrders, updateOrderStatus } from '@/api/mockTransport'
import type { StaffOrder, OrderStatus } from '@/api/types'
import { formatPrice } from '@/utils/format'

const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  NEW: 'New',
  PREPARING: 'Preparing',
  READY: 'Ready',
  DELIVERED: 'Delivered',
}

const STATUS_FILTERS = ['all', 'NEW', 'PREPARING', 'READY', 'DELIVERED'] as const

/** Next valid status for each current status (forward-only lifecycle). */
const NEXT_STATUS: Readonly<Record<OrderStatus, OrderStatus | undefined>> = {
  NEW: 'PREPARING',
  PREPARING: 'READY',
  READY: 'DELIVERED',
  DELIVERED: undefined,
}

const NEXT_STATUS_LABEL: Readonly<Record<OrderStatus, string>> = {
  NEW: 'Start Preparing',
  PREPARING: 'Mark Ready',
  READY: 'Mark Delivered',
  DELIVERED: '',
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function StaffOrdersView() {
  const [orders, setOrders] = useState<StaffOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const statusParam = filter === 'all' ? undefined : filter
      const result = await listAdminOrders(statusParam)
      setOrders(result.orders)
    } catch {
      setError('Failed to load orders.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  async function handleAdvanceStatus(order: StaffOrder) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    setUpdatingId(order.orderId)
    setUpdateError(null)
    try {
      const result = await updateOrderStatus(order.orderId, next)
      if (result.status === 'error') {
        setUpdateError(result.message)
      } else {
        await load()
      }
    } catch {
      setUpdateError('Failed to update order status.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker="Staff"
        title="Active Orders"
        subtitle="One place to manage guest requests and hotel operations."
      />

      <Card>
        <div className="filter-row" role="group" aria-label="Order status filter">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              className={['filter-chip', filter === s ? 'is-selected' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
            >
              <span>{s === 'all' ? 'All' : STATUS_LABELS[s as OrderStatus]}</span>
            </button>
          ))}
        </div>

        <div className="staff-orders__actions">
          <Button variant="secondary" size="sm" onClick={load} disabled={loading}>
            <Icon name="sparkles" size={14} />
            <span>Refresh</span>
          </Button>
        </div>
      </Card>

      {updateError ? (
        <Card>
          <ErrorState title="Status update failed" message={updateError}>
            <div className="state__actions">
              <Button variant="secondary" onClick={() => setUpdateError(null)}>
                Dismiss
              </Button>
            </div>
          </ErrorState>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <LoadingState label="Loading orders..." />
        </Card>
      ) : null}

      {error ? (
        <Card>
          <ErrorState title="Could not load orders" message={error}>
            <div className="state__actions">
              <Button variant="secondary" onClick={load}>
                Try again
              </Button>
            </div>
          </ErrorState>
        </Card>
      ) : null}

      {!loading && !error && orders.length === 0 ? (
        <Card>
          <EmptyState
            title="No orders found"
            message={filter === 'all' ? 'No orders have been placed yet.' : `No ${STATUS_LABELS[filter as OrderStatus]?.toLowerCase()} orders.`}
          />
        </Card>
      ) : null}

      {!loading && !error && orders.length > 0 ? (
        <div className="staff-orders">
          {orders.map((order) => {
            const nextStatus = NEXT_STATUS[order.status]
            return (
              <Card key={order.orderId}>
                <div className="staff-order">
                  <div className="staff-order__header">
                    <div className="staff-order__header-left">
                      <span className="staff-order__room">Room {order.roomNumber}</span>
                      <span className="staff-order__id">Order {order.orderId.slice(0, 8)}...</span>
                    </div>
                    <span className="order-status-badge" data-status={order.status}>
                      {STATUS_LABELS[order.status]}
                    </span>
                  </div>

                  <ul className="staff-order__items">
                    {order.items.map((item) => (
                      <li key={item.itemId}>
                        <span>{item.name} x{item.quantity}</span>
                        <span>{formatPrice(item.unitPrice * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  {order.notes ? (
                    <p className="staff-order__notes">Note: {order.notes}</p>
                  ) : null}

                  <div className="staff-order__footer">
                    <span className="staff-order__total">{formatPrice(order.total)}</span>
                    <span className="staff-order__time">{formatTime(order.createdAt)}</span>
                  </div>

                  {nextStatus ? (
                    <div className="staff-order__actions">
                      <Button
                        size="sm"
                        onClick={() => void handleAdvanceStatus(order)}
                        disabled={updatingId === order.orderId}
                      >
                        {updatingId === order.orderId ? (
                          'Updating...'
                        ) : (
                          NEXT_STATUS_LABEL[order.status]
                        )}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Card>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
