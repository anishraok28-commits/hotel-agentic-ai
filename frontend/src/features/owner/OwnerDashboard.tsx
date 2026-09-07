/**
 * Owner Dashboard (read-only).
 *
 * Displays key metrics:
 * - Room service revenue (24h)
 * - Active orders by status
 * - Session-based room utilization
 *
 * All metrics are clearly labeled to avoid misinterpretation.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/icon/Icon'
import { LoadingState } from '@/components/state/LoadingState'
import { ErrorState } from '@/components/state/ErrorState'
import { fetchDashboard, type DashboardMetrics } from '@/features/owner/ownerApi'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100) // Assuming amount is in cents
}

export function OwnerDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDashboard()
      setMetrics(data)
    } catch {
      setError('Failed to load dashboard metrics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  if (loading) {
    return (
      <section className="mode-page">
        <Card>
          <LoadingState label="Loading dashboard..." />
        </Card>
      </section>
    )
  }

  if (error) {
    return (
      <section className="mode-page">
        <Card>
          <ErrorState title="Error" message={error}>
            <div className="state__actions">
              <Button variant="secondary" onClick={loadDashboard}>
                Retry
              </Button>
            </div>
          </ErrorState>
        </Card>
      </section>
    )
  }

  if (!metrics) {
    return (
      <section className="mode-page">
        <Card>
          <ErrorState title="No data" message="No dashboard metrics available." />
        </Card>
      </section>
    )
  }

  const totalActiveOrders = metrics.activeOrders.NEW + metrics.activeOrders.PREPARING + metrics.activeOrders.READY
  const utilizationPercent = metrics.roomUtilization.activeRooms > 0
    ? Math.round((metrics.roomUtilization.activeSessions / metrics.roomUtilization.activeRooms) * 100)
    : 0

  return (
    <section className="mode-page">
      <div className="owner-dashboard">
        <div className="owner-dashboard__grid">
          <Card title="Room Service Revenue (24h)">
            <div className="metric-card">
              <span className="metric-value">{formatCurrency(metrics.roomServiceRevenue)}</span>
              <span className="metric-label">Last 24 hours</span>
            </div>
          </Card>

          <Card title="Active Orders">
            <div className="metric-card">
              <span className="metric-value">{totalActiveOrders}</span>
              <span className="metric-label">Total active</span>
            </div>
            <div className="metric-breakdown">
              <span>New: {metrics.activeOrders.NEW}</span>
              <span>Preparing: {metrics.activeOrders.PREPARING}</span>
              <span>Ready: {metrics.activeOrders.READY}</span>
            </div>
          </Card>

          <Card title="Room Utilization">
            <div className="metric-card">
              <span className="metric-value">{utilizationPercent}%</span>
              <span className="metric-label">Sessions / Active rooms</span>
            </div>
            <div className="metric-breakdown">
              <span>{metrics.roomUtilization.activeSessions} active sessions</span>
              <span>{metrics.roomUtilization.activeRooms} active rooms</span>
            </div>
          </Card>
        </div>

        <div className="owner-dashboard__footer">
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            Revenue reflects room service orders only. Late checkout and booking revenue
            are tracked separately in Google Sheets.
          </p>
          <Button variant="secondary" size="sm" onClick={loadDashboard}>
            <Icon name="sparkles" size={14} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>
    </section>
  )
}
