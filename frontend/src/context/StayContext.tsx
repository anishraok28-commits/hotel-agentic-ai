/**
 * StayContext provides the active stay and order history across all
 * guest-facing views. It fetches from GET /api/stay/current to restore
 * state after page refresh, mode switch, or cross-device access.
 *
 * The backend/database is the source of truth. Browser sessionStorage
 * only stores credentials (guestId, sessionId, qrToken); the stay
 * data is always fetched fresh from the backend.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { fetchCurrentStay, type StayData } from '@/api/mockTransport'
import { useGuestContext } from '@/context/GuestContext'

export interface StayContextValue {
  /** The active stay data, or null if no active stay. */
  readonly stay: StayData['stay']
  /** Session credentials from the backend (may differ from local if recovered). */
  readonly session: StayData['session'] | null
  /** Orders belonging to the current active stay. */
  readonly orders: StayData['orders']
  /** Whether the stay is currently being fetched. */
  readonly loading: boolean
  /** Last fetch error, if any. */
  readonly error: string | null
  /** Re-fetch the current stay from the backend. */
  readonly refresh: () => void
  /** Update session credentials after server-side recovery. */
  readonly updateSession: (guestId: string, sessionId: string) => void
}

const StayCtx = createContext<StayContextValue>({
  stay: null,
  session: null,
  orders: [],
  loading: false,
  error: null,
  refresh: () => {},
  updateSession: () => {},
})

export function useStayContext(): StayContextValue {
  return useContext(StayCtx)
}

export function StayProvider({ children }: { children: React.ReactNode }) {
  const guestCtx = useGuestContext()
  const [stay, setStay] = useState<StayData['stay']>(null)
  const [session, setSession] = useState<StayData['session'] | null>(null)
  const [orders, setOrders] = useState<StayData['orders']>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const doFetch = useCallback(async () => {
    if (!guestCtx.qrToken) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchCurrentStay(guestCtx.qrToken)
      if (result.status === 'ok') {
        setStay(result.data.stay)
        setSession(result.data.session)
        setOrders(result.data.orders)
      } else {
        setError(result.message)
      }
    } catch {
      setError('Failed to fetch stay data')
    } finally {
      setLoading(false)
    }
  }, [guestCtx.qrToken])

  useEffect(() => {
    void doFetch()
  }, [doFetch, refreshKey])

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const updateSession = useCallback((guestId: string, sessionId: string) => {
    setSession((prev) => prev ? { ...prev, guestId, sessionId } : null)
  }, [])

  const value = useMemo(() => ({
    stay,
    session,
    orders,
    loading,
    error,
    refresh,
    updateSession,
  }), [stay, session, orders, loading, error, refresh, updateSession])

  return (
    <StayCtx.Provider value={value}>
      {children}
    </StayCtx.Provider>
  )
}
