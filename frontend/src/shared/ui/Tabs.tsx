import type { ReactNode } from 'react'
import { cx } from './cx'
import Link from './Link'
import './Tabs.css'

export type TabLink = { to: string; label: ReactNode }

/**
 * Tabs that are pages (Settings: Profile / Billing): each is a link, the current one has
 * aria-current="page", and back/forward and copy-link work.
 */
export default function Tabs({ label, tabs, current, className }: { label: string; tabs: readonly TabLink[]; current: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx('ui-tabs', className)}>
      {tabs.map((tab) => (
        <Link key={tab.to} to={tab.to} aria-current={tab.to === current ? 'page' : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
