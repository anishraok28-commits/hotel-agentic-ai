import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuth, type StaffRole } from '@/auth/AuthContext'

interface StaffTab {
  readonly path: string
  readonly label: string
  readonly roles: readonly StaffRole[]
}

const STAFF_TABS: readonly StaffTab[] = [
  { path: '/staff/orders', label: 'Active Orders', roles: ['FRONT_DESK', 'KITCHEN', 'MANAGER'] },
  { path: '/staff/rooms-qr', label: 'Rooms & QR', roles: ['FRONT_DESK', 'MANAGER'] },
  { path: '/staff/dashboard', label: 'Dashboard', roles: ['MANAGER', 'OWNER'] },
  { path: '/staff/users', label: 'Users', roles: ['MANAGER', 'OWNER'] },
]

export function StaffShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const role = user?.role ?? 'FRONT_DESK'
  const visibleTabs = STAFF_TABS.filter((tab) => tab.roles.includes(role))

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <section className="mode-page">
      <PageHeader
        kicker="Staff"
        title="Staff Dashboard"
        subtitle={`Logged in as ${user?.name ?? 'Staff'} (${role})`}
      />

      <div className="staff-role-selector">
        <span className="staff-role-selector__label">
          Role: {role}
        </span>
        <button
          onClick={handleLogout}
          className="staff-role-selector__logout"
          type="button"
        >
          Sign Out
        </button>
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
