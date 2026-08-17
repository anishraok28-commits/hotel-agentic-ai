import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AIConciergeView } from '@/modes/concierge/AIConciergeView'
import { QRRoomServiceView } from '@/modes/room-service/QRRoomServiceView'
import { LateCheckoutView } from '@/modes/late-checkout/LateCheckoutView'
import { UnifiedRouterView } from '@/modes/unified/UnifiedRouterView'

/**
 * Single frontend, four modes. 3_IN_1_UNIFIED lives at "/" and routes to the
 * other three modes. No route here maps to any backend endpoint directly.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<UnifiedRouterView />} />
          <Route path="/concierge" element={<AIConciergeView />} />
          <Route path="/room-service" element={<QRRoomServiceView />} />
          <Route path="/late-checkout" element={<LateCheckoutView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}