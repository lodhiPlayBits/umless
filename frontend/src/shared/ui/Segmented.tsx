import type { ReactNode } from 'react'
import { cx } from './cx'
import './Segmented.css'

export type SegmentOption<T extends string> = { value: T; label: ReactNode }

type SegmentedProps<T extends string> = {
  /** Names the group for screen readers, e.g. "Billing period". */
  label: string
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** Pick one of a few options (7 days / 30 days / All). Each option is a toggle button with aria-pressed. */
export default function Segmented<T extends string>({ label, options, value, onChange, className }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx('ui-segmented', className)}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}
