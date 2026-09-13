import { NavLink } from 'react-router-dom'
import { MODE_ORDER, MODES } from '@/modes/modeRegistry'
import { Icon } from '@/components/icon/Icon'
import { useAuth } from '@/auth/AuthContext'

/** Navigation links for all four frontend modes (unified last). Hidden when staff is authenticated. */
export function ModeNav() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return null

  return (
    <nav className="mode-nav" aria-label="Hotel services">
      <ul className="mode-nav__list">
        {MODE_ORDER.map((id) => {
          const mode = MODES[id]
          return (
            <li key={mode.id}>
              <NavLink
                to={mode.path}
                end={mode.path === '/'}
                className={({ isActive }) => (isActive ? 'mode-nav__link is-active' : 'mode-nav__link')}
              >
                <Icon name={mode.icon} size={18} />
                <span>{mode.title}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}