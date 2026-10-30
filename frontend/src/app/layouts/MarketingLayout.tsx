import { useSession } from '@/shared/lib/session'
import { HOME_PATH, PATHS } from '@/shared/config/paths'
import { ThemeToggle } from '@/shared/theme'
import { ButtonLink, Icon, Link } from '@/shared/ui'
import Logo from './Logo'
import SiteFooter from './SiteFooter'
import type { LayoutProps } from './types'
import './MarketingLayout.css'

type NavLink = { to: string; label: string; id?: string; signedOutOnly?: boolean }

// The landing page's sections only exist for signed-out visitors (signed-in users go to the app).
const LINKS: NavLink[] = [
  { to: '/#features', label: 'Features', signedOutOnly: true },
  { to: '/#how', label: 'How it works', signedOutOnly: true },
  { to: PATHS.pricing, label: 'Pricing', id: 'pricing' },
  { to: '/#faq', label: 'FAQ', signedOutOnly: true },
]

/** The public site: sticky header, a menu on phones, and the footer. */
export default function MarketingLayout({ route, children }: LayoutProps) {
  const { status } = useSession()
  const signedIn = status === 'signedIn'
  const links = LINKS.filter((link) => !(signedIn && link.signedOutOnly))
  return (
    <div className="site">
      <header className="site-head">
        <div className="site-head__inner">
          <Logo to={signedIn ? HOME_PATH : PATHS.landing} />
          <nav aria-label="Main" className="site-head__links">
            {links.map((link) => (
              <Link key={link.to} to={link.to} aria-current={route.id === link.id ? 'page' : undefined}>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="site-head__actions">
            <ThemeToggle />
            {signedIn ? (
              <ButtonLink to={HOME_PATH} variant="primary" size="sm">
                Open umless
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to={PATHS.signIn} variant="ghost" size="sm" className="site-head__login">
                  Log in
                </ButtonLink>
                <ButtonLink to={PATHS.signUp} variant="primary" size="sm">
                  Start free
                </ButtonLink>
              </>
            )}
            <details className="site-head__menu">
              <summary className="ui-button ui-button--ghost ui-button--icon" aria-label="Menu">
                <Icon name="menu" />
              </summary>
              <nav
                aria-label="Menu"
                className="site-head__panel"
                // A tapped link navigates in-app, so close the menu by hand.
                onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
              >
                {links.map((link) => (
                  <Link key={link.to} to={link.to}>
                    {link.label}
                  </Link>
                ))}
                {!signedIn && <Link to={PATHS.signIn}>Log in</Link>}
              </nav>
            </details>
          </div>
        </div>
      </header>
      <main className="site-main">{children}</main>
      <SiteFooter />
    </div>
  )
}
