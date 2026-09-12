import { useState, useEffect, useCallback, useMemo } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AIConciergeView } from '@/modes/concierge/AIConciergeView'
import { QRRoomServiceView } from '@/modes/room-service/QRRoomServiceView'
import { LateCheckoutView } from '@/modes/late-checkout/LateCheckoutView'
import { UnifiedRouterView } from '@/modes/unified/UnifiedRouterView'
import { StaffOrdersView } from '@/modes/staff/StaffOrdersView'
import { StaffRoomsQRView } from '@/modes/staff/StaffRoomsQRView'
import { StaffShell } from '@/modes/staff/StaffShell'
import { UserManagementView } from '@/modes/staff/UserManagementView'
import { OwnerDashboard } from '@/features/owner/OwnerDashboard'
import { QRManagementView } from '@/modes/admin/QRManagementView'
import { NotFound } from '@/components/state/NotFound'
import { FeedbackCapture } from '@/modes/internal/FeedbackCapture'
import { PrivacyPolicy } from '@/modes/internal/PrivacyPolicy'
import { TermsOfService } from '@/modes/internal/TermsOfService'
import { PilotChecklist } from '@/modes/internal/PilotChecklist'
import { TeamRoles } from '@/modes/internal/TeamRoles'
import { BusinessReadiness } from '@/modes/internal/BusinessReadiness'
import { LoginPage } from '@/modes/auth/LoginPage'
import { ChangePasswordPage } from '@/modes/auth/ChangePasswordPage'
import { AuthProvider } from '@/auth/AuthContext'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
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
import { StayProvider } from '@/context/StayContext'

/**
 * Root landing handler: intercepts QR code scan URLs (/?token=...&room=...),
 * validates the token server-side, populates GuestContext, and redirects.
 * URLs without token params go straight to the unified view.
 */
export function RootLanding() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qrToken = searchParams.get('token') ?? ''

  // Synchronous capture: persist the QR token to sessionStorage before
  // any async init or navigation strips it from the URL bar.
  const params = new URLSearchParams(window.location.search)
  const incomingToken = params.get('token') || params.get('qr')
  if (incomingToken) {
    sessionStorage.setItem('qrToken', incomingToken)
    const existing = sessionStorage.getItem('hotel-guest-context')
    if (!existing) {
      sessionStorage.setItem('hotel-guest-context', JSON.stringify({ qrToken: incomingToken }))
    }
  }

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
  // (after an API call). Re-read on every render to pick up any
  // context that was saved between our initial useState read and now.
  // Guard against infinite loops: only update when the stored qrToken
  // differs from the current context qrToken.
  const stored = loadGuestContext()
  if (stored && stored.qrToken !== context.qrToken) {
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
      <AuthProvider>
        <GuestContextProvider>
          <StayProvider>
            <AppShell>
              <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/change-password" element={
                <ProtectedRoute>
                  <ChangePasswordPage />
                </ProtectedRoute>
              } />
              <Route path="/" element={<RootLanding />} />
              <Route path="/concierge" element={<AIConciergeView />} />
              <Route path="/room-service" element={<QRRoomServiceView />} />
              <Route path="/late-checkout" element={<LateCheckoutView />} />
              <Route path="/staff-orders" element={<Navigate to="/staff/orders" replace />} />
              <Route
                path="/staff"
                element={
                  <ProtectedRoute>
                    <StaffShell />
                  </ProtectedRoute>
                }
              >
                <Route path="orders" element={<StaffOrdersView />} />
                <Route path="rooms-qr" element={<StaffRoomsQRView />} />
                <Route
                  path="dashboard"
                  element={
                    <ProtectedRoute requiredRoles={['MANAGER', 'OWNER']}>
                      <OwnerDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute requiredRoles={['MANAGER', 'OWNER']}>
                      <UserManagementView />
                    </ProtectedRoute>
                  }
                />
              </Route>
              <Route path="/qr-management" element={
                <ProtectedRoute>
                  <QRManagementView />
                </ProtectedRoute>
              } />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/internal/feedback" element={
                <ProtectedRoute>
                  <FeedbackCapture />
                </ProtectedRoute>
              } />
              <Route path="/internal/pilot-checklist" element={
                <ProtectedRoute>
                  <PilotChecklist />
                </ProtectedRoute>
              } />
              <Route path="/internal/team-roles" element={
                <ProtectedRoute>
                  <TeamRoles />
                </ProtectedRoute>
              } />
              <Route path="/internal/business-readiness" element={
                <ProtectedRoute>
                  <BusinessReadiness />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </AppShell>
          </StayProvider>
        </GuestContextProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
