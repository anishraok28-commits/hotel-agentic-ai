import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { getCurrentRole, setCurrentRole, hasPermission, ALL_STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from '@/auth/staffAuth'

interface StaffTab {
  readonly path: string
  readonly label: string
  readonly permission: string
}

const STAFF_TABS: readonly StaffTab[] = [
  { path: '/staff/orders', label: 'Active Orders', permission: 'orders' },
  { path: '/staff/rooms-qr', label: 'Rooms & QR', permission: 'rooms-qr-view' },
  { path: '/staff/dashboard', label: 'Dashboard', permission: 'dashboard' },
]

export function StaffShell() {
  const role = getCurrentRole()
  const visibleTabs = STAFF_TABS.filter((tab) => hasPermission(role, tab.permission))

  function handleRoleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setCurrentRole(event.target.value as StaffRole)
    window.location.reload()
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker="Staff"
        title="Staff Dashboard"
        subtitle="Manage guest orders and room QR codes."
      />

      <div className="staff-role-selector">
        <label htmlFor="staff-role">Role:</label>
        <select
          id="staff-role"
          value={role}
          onChange={handleRoleChange}
          className="staff-role-selector__select"
        >
          {ALL_STAFF_ROLES.map((r) => (
            <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
          ))}
        </select>
      </div>

      <nav className="staff-tabs" aria-label="Staff navigation">
        <ul className="staff-tabs__list">
          {visibleTabs.map((tab) => (
            <li key={tab.path}>
              <NavLink
                to={tab.path}
                className={({ isActive }) =>
                  isActive ? 'staff-tabs__link is-active' : 'staff-tabs__link'
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </section>
  )
}

interface StaffLayoutProps {
  readonly children: ReactNode
  readonly title: string
  readonly subtitle?: string
}

export function StaffLayout({ children, title, subtitle }: StaffLayoutProps) {
  return (
    <>
      <h2 className="staff-layout__title">{title}</h2>
      {subtitle ? <p className="staff-layout__subtitle">{subtitle}</p> : null}
      {children}
    </>
  )
}
