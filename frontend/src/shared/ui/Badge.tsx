import type { ComponentProps } from 'react'
import { cx } from './cx'
import './Badge.css'

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

/** A small pill label. `dashed` marks a design note or placeholder. */
export default function Badge({ tone = 'neutral', dashed = false, className, ...props }: ComponentProps<'span'> & { tone?: BadgeTone; dashed?: boolean }) {
  return <span className={cx('ui-badge', tone !== 'neutral' && `ui-badge--${tone}`, dashed && 'ui-badge--dashed', className)} {...props} />
}
