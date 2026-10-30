import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cx } from './cx'
import './Card.css'

/** A bordered box. `surface` gives it the grey surface background. */
export function Card({ surface = false, className, ...props }: ComponentProps<'div'> & { surface?: boolean }) {
  return <div className={cx('ui-card', surface && 'ui-card--surface', className)} {...props} />
}

type PanelProps = Omit<ComponentProps<'section'>, 'title'> & {
  /** The panel's heading; it also names the section for screen readers. */
  title?: ReactNode
  /** Shown at the right of the heading: a badge, a "See all" link. */
  actions?: ReactNode
  headingLevel?: 2 | 3
}

/** A titled section of a page (dashboard tiles, settings groups). */
export function Panel({ title, actions, headingLevel = 2, className, children, ...props }: PanelProps) {
  const headingId = useId()
  const Heading = `h${headingLevel}` as const
  return (
    <section className={cx('ui-panel', className)} aria-labelledby={title ? headingId : undefined} {...props}>
      {(title || actions) && (
        <div className="ui-panel__head">
          {title && <Heading id={headingId}>{title}</Heading>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}
