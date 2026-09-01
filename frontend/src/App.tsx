import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { AIConciergeView } from '@/modes/concierge/AIConciergeView'
import { QRRoomServiceView } from '@/modes/room-service/QRRoomServiceView'
import { LateCheckoutView } from '@/modes/late-checkout/LateCheckoutView'
import { UnifiedRouterView } from '@/modes/unified/UnifiedRouterView'
import { StaffOrdersView } from '@/modes/staff/StaffOrdersView'
import { NotFound } from '@/components/state/NotFound'

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<UnifiedRouterView />} />
          <Route path="/concierge" element={<AIConciergeView />} />
          <Route path="/room-service" element={<QRRoomServiceView />} />
          <Route path="/late-checkout" element={<LateCheckoutView />} />
          <Route path="/staff-orders" element={<StaffOrdersView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
