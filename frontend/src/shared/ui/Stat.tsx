import type { ReactNode } from 'react'
import { cx } from './cx'
import './Stat.css'

export type StatTrend = 'better' | 'worse' | 'neutral'

type StatProps = {
  label: ReactNode
  value: ReactNode
  /** A unit after the value, smaller and muted ("wpm", "s"). */
  unit?: ReactNode
  /** A line under the value ("↓ 0.3 vs last week"). */
  note?: ReactNode
  /** Colours the note: better is green, worse is amber. Whether up or down is better is the caller's call. */
  trend?: StatTrend
  className?: string
}

/** One number with its label: the dashboard and result tiles. */
export default function Stat({ label, value, unit, note, trend = 'neutral', className }: StatProps) {
  return (
    <div className={cx('ui-stat', className)}>
      <span className="ui-stat__label">{label}</span>
      <span className="ui-stat__value">
        {value}
        {unit && <small> {unit}</small>}
      </span>
      {note && <span className={cx('ui-stat__note', `ui-stat__note--${trend}`)}>{note}</span>}
    </div>
  )
}
