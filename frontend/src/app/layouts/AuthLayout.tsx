import { LEGAL_PAGES } from '@/content/business'
import { PATHS } from '@/shared/config/paths'
import { ThemeToggle } from '@/shared/theme'
import { Link } from '@/shared/ui'
import Logo from './Logo'
import type { LayoutProps } from './types'
import './AuthLayout.css'

/** Sign in and sign up: the form alone, centred, with the logo and legal links. */
export default function AuthLayout({ children }: LayoutProps) {
  return (
    <div className="auth">
      <header className="auth__head">
        <Logo to={PATHS.landing} />
        <ThemeToggle />
      </header>
      <main className="auth__main">{children}</main>
      <footer className="auth__foot">
        {LEGAL_PAGES.map((page) => (
          <Link key={page.id} to={`/${page.id}`}>
            {page.title}
          </Link>
        ))}
      </footer>
    </div>
  )
}
