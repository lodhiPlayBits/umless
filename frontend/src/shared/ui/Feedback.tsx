import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import { cx } from './cx'
import Icon from './Icon'
import type { IconName } from './Icon'
import './Feedback.css'

type EmptyStateProps = {
  icon?: IconName
  title: ReactNode
  children?: ReactNode
  /** Buttons under the text. */
  actions?: ReactNode
  /** No dashed frame: for a whole page (not found) rather than an empty list. */
  bare?: boolean
  /** Make the title the page's heading. */
  headingLevel?: 1 | 2
  className?: string
}

/** What a list or page shows when there's nothing in it yet. */
export function EmptyState({ icon, title, children, actions, bare = false, headingLevel, className }: EmptyStateProps) {
  const Title = headingLevel ? (`h${headingLevel}` as const) : 'strong'
  return (
    <div className={cx('ui-empty', bare && 'ui-empty--bare', className)}>
      {icon && (
        <span className="ui-icon-tile">
          <Icon name={icon} />
        </span>
      )}
      <Title className="ui-empty__title">{title}</Title>
      {children && <div className="ui-empty__text">{children}</div>}
      {actions && <div className="ui-empty__actions">{actions}</div>}
    </div>
  )
}

/** A shimmering placeholder line while content loads. Width and height as CSS lengths. */
export function Skeleton({ width = '100%', height = 16, className }: { width?: CSSProperties['width']; height?: CSSProperties['height']; className?: string }) {
  return <span aria-hidden="true" className={cx('ui-skeleton', className)} style={{ width, height }} />
}

/** A spinner. Decorative: put the "Loading…" or "Transcribing…" text next to it. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('ui-spinner', className)} />
}

/** A keyboard key, e.g. <Kbd>Space</Kbd>. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd className={cx('ui-kbd', className)} {...props} />
}

/** An icon on a tinted square (feature cards, empty states). */
export function IconTile({ icon, tone = 'primary' }: { icon: IconName; tone?: 'primary' | 'danger' }) {
  return (
    <span className={cx('ui-icon-tile', tone === 'danger' && 'ui-icon-tile--danger')}>
      <Icon name={icon} />
    </span>
  )
}
