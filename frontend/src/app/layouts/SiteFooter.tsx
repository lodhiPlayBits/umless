import { BUSINESS, LEGAL_PAGES } from '@/content/business'
import { PATHS } from '@/shared/config/paths'
import { Link } from '@/shared/ui'
import Logo from './Logo'
import './SiteFooter.css'

/** The marketing site's footer. The legal links must stay reachable without an account (Razorpay). */
export default function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-foot__inner">
      <div className="site-foot__grid">
        <div className="site-foot__brand">
          <Logo to={PATHS.landing} />
          <p>Practise out loud. Say less um.</p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <ul>
            <li>
              <Link to={PATHS.pricing}>Pricing</Link>
            </li>
            <li>
              <Link to={PATHS.signUp}>Start free</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2>Legal</h2>
          <ul>
            {LEGAL_PAGES.map((page) => (
              <li key={page.id}>
                <Link to={`/${page.id}`}>{page.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="site-foot__bottom">
        <span>
          © 2026 {BUSINESS.name} · <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>
        </span>
        <span>Made for people who practise out loud.</span>
      </div>
      </div>
    </footer>
  )
}
