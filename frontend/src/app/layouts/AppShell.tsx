import { UserButton } from '@clerk/react'
import { navRoutes, routeById } from '@/app/routes'
import { useSession } from '@/shared/lib/session'
import { PracticeTime, PracticeTimeCard } from '@/features/billing'
import { HOME_PATH } from '@/shared/config/paths'
import { ThemeToggle } from '@/shared/theme'
import { Icon, Link } from '@/shared/ui'
import Logo from './Logo'
import type { LayoutProps } from './types'
import './AppShell.css'

/**
 * The signed-in app: a sidebar on wide screens, a top bar, and a tab bar on phones
 * (docs/design/v2/assets/app.css). The nav comes from the route table.
 */
export default function AppShell({ route, children }: LayoutProps) {
  const { auth } = useSession()
  const nav = navRoutes()
  const parent = route.parent ? routeById(route.parent) : undefined
  const current = (id: string) => (route.id === id || route.parent === id ? 'page' : undefined)

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <Logo to={HOME_PATH} />
        <nav aria-label="App" className="shell-nav">
          {nav.map((item) => (
            <Link key={item.id} to={item.pattern} className="shell-nav__link" aria-current={current(item.id)}>
              <Icon name={item.nav!.icon} />
              {item.nav!.label}
            </Link>
          ))}
        </nav>
        <PracticeTimeCard className="shell-sidebar__card" />
      </aside>
      <div className="shell-main">
        <header className="shell-top">
          <Logo to={HOME_PATH} className="shell-top__logo" />
          <div className="shell-crumbs">
            {parent && (
              <>
                <Link to={parent.pattern}>{parent.title}</Link>
                <Icon name="right" />
              </>
            )}
            <strong>{route.title}</strong>
          </div>
          <span className="shell-top__spacer" />
          <PracticeTime className="shell-top__time" />
          <ThemeToggle />
          {auth === 'clerk' && <UserButton />}
        </header>
        <main className="shell-content" data-width={route.width ?? 'content'}>
          {children}
        </main>
      </div>
      <nav aria-label="App" className="shell-tabbar">
        {nav.map((item) => (
          <Link key={item.id} to={item.pattern} aria-current={current(item.id)}>
            <Icon name={item.nav!.icon} />
            {item.nav!.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
