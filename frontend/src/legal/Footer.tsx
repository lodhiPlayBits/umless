import Link from '../Link'
import { BUSINESS, LEGAL_PAGES } from './business'

/** On every page, signed in or not: the legal pages must be reachable by anyone. */
export default function Footer() {
  return (
    <footer className="site-footer small">
      <nav aria-label="Legal">
        {LEGAL_PAGES.map((page) => (
          <Link key={page.id} to={`/${page.id}`}>
            {page.title}
          </Link>
        ))}
      </nav>
      <p className="muted">
        © 2026 {BUSINESS.name} · <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
      </p>
    </footer>
  )
}
