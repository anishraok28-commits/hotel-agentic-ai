import { useState, useEffect, useCallback, useMemo } from 'react'
import { BrowserRouter, Routes, Route, useSearchParams, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AIConciergeView } from '@/modes/concierge/AIConciergeView'
import { QRRoomServiceView } from '@/modes/room-service/QRRoomServiceView'
import { LateCheckoutView } from '@/modes/late-checkout/LateCheckoutView'
import { UnifiedRouterView } from '@/modes/unified/UnifiedRouterView'
import { StaffOrdersView } from '@/modes/staff/StaffOrdersView'
import { QRManagementView } from '@/modes/admin/QRManagementView'
import { NotFound } from '@/components/state/NotFound'
import { Card } from '@/components/ui/Card'
import { LoadingState } from '@/components/state/LoadingState'
import { ErrorState } from '@/components/state/ErrorState'
import { initGuestSession } from '@/api/mockTransport'
import {
  GuestContext,
  saveGuestContext,
  loadGuestContext,
  type GuestContextValue,
} from '@/context/GuestContext'

/**
 * Root landing handler: intercepts QR code scan URLs (/?token=...&room=...),
 * validates the token server-side, populates GuestContext, and redirects.
 * URLs without token params go straight to the unified view.
 */
export function RootLanding() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qrToken = searchParams.get('token') ?? ''

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!qrToken) {
      navigate('/', { replace: true })
      return
    }

    // Check for existing valid context
    const existing = loadGuestContext()
    if (existing && existing.qrToken === qrToken) {
      const hasActiveOrder = !!sessionStorage.getItem('qr-room-service-active-order')
      navigate(hasActiveOrder ? '/room-service' : '/', { replace: true })
      return
    }

    let cancelled = false

    async function initSession() {
      const result = await initGuestSession(qrToken)
      if (cancelled) return

      if (result.status === 'error') {
        setError(result.message)
        return
      }

      const ctx: GuestContextValue = {
        roomNumber: (result.data?.roomId as number) ?? null,
        guestId: (result.data?.guestId as string) ?? '',
        sessionId: (result.data?.sessionId as string) ?? '',
        qrToken,
        updateSession: () => {},
      }

      saveGuestContext(ctx)
      navigate('/', { replace: true })
    }

    void initSession()
    return () => { cancelled = true }
  }, [qrToken, navigate])

  if (error) {
    return (
      <section className="mode-page">
        <Card>
          <ErrorState title="QR code error" message={error} />
        </Card>
      </section>
    )
  }

  if (qrToken) {
    return (
      <section className="mode-page">
        <Card>
          <LoadingState label="Verifying your room..." />
        </Card>
      </section>
    )
  }

  return <UnifiedRouterView />
}

/**
 * Wrapper that reads GuestContext from sessionStorage and provides it
 * to all child routes. Re-syncs after RootLanding saves context
 * asynchronously during the initial QR scan flow.
 *
 * Uses a render-time read (not useEffect) so that when RootLanding
 * writes to sessionStorage between mount and the next render, the
 * provider picks it up without requiring an extra re-render trigger.
 */
export function GuestContextProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<GuestContextValue>(() => {
    const stored = loadGuestContext()
    return {
      roomNumber: stored?.roomNumber ?? null,
      guestId: stored?.guestId ?? '',
      sessionId: stored?.sessionId ?? '',
      qrToken: stored?.qrToken ?? '',
      updateSession: () => {},
    }
  })

  // RootLanding saves guest context to sessionStorage asynchronously
  // (after an API call). Read at render time to pick up any context
  // that was saved between our initial useState read and now.
  // React allows conditional setState during render (adjusting state
  // based on props/state) — this fires at most once per mount.
  const stored = loadGuestContext()
  if (stored && stored.qrToken && !context.qrToken) {
    setContext((prev) => ({
      ...prev,
      roomNumber: stored.roomNumber,
      guestId: stored.guestId,
      sessionId: stored.sessionId,
      qrToken: stored.qrToken,
    }))
  }

  const updateSession = useCallback((guestId: string, sessionId: string) => {
    setContext((prev) => {
      const next = { ...prev, guestId, sessionId }
      saveGuestContext(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ ...context, updateSession }), [context, updateSession])

  return (
    <GuestContext.Provider value={value}>
      {children}
    </GuestContext.Provider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <GuestContextProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<RootLanding />} />
            <Route path="/concierge" element={<AIConciergeView />} />
            <Route path="/room-service" element={<QRRoomServiceView />} />
            <Route path="/late-checkout" element={<LateCheckoutView />} />
            <Route path="/staff-orders" element={<StaffOrdersView />} />
            <Route path="/qr-management" element={<QRManagementView />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppShell>
      </GuestContextProvider>
    </BrowserRouter>
  )
}
