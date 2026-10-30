import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cx } from './cx'
import './Switch.css'

type SwitchProps = Omit<ComponentProps<'input'>, 'type' | 'role'> & {
  label: ReactNode
  /** A line under the label. */
  description?: ReactNode
}

/** An on/off setting: a native checkbox with role="switch", so it keeps keyboard and form behaviour. */
export default function Switch({ label, description, className, id, ...props }: SwitchProps) {
  const ownId = useId()
  const inputId = id ?? ownId
  const descriptionId = description ? `${inputId}-description` : undefined
  return (
    <div className={cx('ui-switch-row', className)}>
      <div className="ui-switch-row__text">
        <label htmlFor={inputId} className="ui-switch-row__label">
          {label}
        </label>
        {description && (
          <span id={descriptionId} className="ui-switch-row__description">
            {description}
          </span>
        )}
      </div>
      <span className="ui-switch">
        <input type="checkbox" role="switch" id={inputId} aria-describedby={descriptionId} {...props} />
        <span aria-hidden="true" />
      </span>
    </div>
  )
}
