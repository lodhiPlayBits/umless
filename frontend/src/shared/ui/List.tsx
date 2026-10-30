import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'
import Link from './Link'
import './List.css'

/** A bordered list of rows. Renders an <ol> by default, since most of the app's lists are ordered. */
export function List({ as = 'ol', className, ...props }: Omit<ComponentProps<'ol'>, 'ref'> & { as?: 'ol' | 'ul' | 'div' }) {
  // The three tags share every attribute a list needs; typing them as one keeps the props simple.
  const Tag = as as 'ol'
  return <Tag className={cx('ui-list', className)} {...props} />
}

type RowContent = {
  /** The main line, clamped to two lines. */
  title: ReactNode
  /** A muted line under the title. */
  meta?: ReactNode
  /** Before the text: a number or an icon. */
  lead?: ReactNode
  /** At the end: a badge or buttons. */
  end?: ReactNode
}

function RowBody({ title, meta, lead, end }: RowContent) {
  return (
    <>
      {lead !== undefined && <span className="ui-row__lead">{lead}</span>}
      <span className="ui-row__text">
        <span className="ui-row__title">{title}</span>
        {meta && <span className="ui-row__meta">{meta}</span>}
      </span>
      {end && <span className="ui-row__end">{end}</span>}
    </>
  )
}

/** One row of a <List>. */
export function ListRow({ title, meta, lead, end, className, ...props }: RowContent & Omit<ComponentProps<'li'>, 'title'>) {
  return (
    <li className={cx('ui-row', className)} {...props}>
      <RowBody title={title} meta={meta} lead={lead} end={end} />
    </li>
  )
}

/** A row that is one link, e.g. a take that opens its result. Use inside <List as="div">. */
export function LinkRow({ title, meta, lead, end, className, ...props }: RowContent & Omit<ComponentProps<typeof Link>, 'title'>) {
  return (
    <Link className={cx('ui-row', 'ui-row--link', className)} {...props}>
      <RowBody title={title} meta={meta} lead={lead} end={end} />
    </Link>
  )
}

/** A small uppercase heading between rows ("Today", "This week"). */
export function ListGroupLabel({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cx('ui-list__group', className)} {...props} />
}
