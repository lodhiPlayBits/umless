import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cx } from './cx'
import { FieldContext, useFieldControl } from './fieldContext'
import Icon from './Icon'
import './Field.css'

type FieldProps = {
  label: ReactNode
  /** Shown under the control while there's no error. */
  hint?: ReactNode
  /** Replaces the hint and marks the control invalid. */
  error?: ReactNode
  /** Keep the label for screen readers only. */
  hideLabel?: boolean
  /** The control's id; generated when left out. */
  id?: string
  className?: string
  children: ReactNode
}

/**
 * A label, a control and its hint or error. The <Input>, <Textarea> or <Select> inside gets its
 * id, aria-describedby and aria-invalid from here, so callers never wire them by hand.
 */
export function Field({ label, hint, error, hideLabel = false, id: ownId, className, children }: FieldProps) {
  const generatedId = useId()
  const id = ownId ?? generatedId
  const messageId = `${id}-message`
  const message = error ?? hint
  return (
    <div className={cx('ui-field', className)}>
      <label htmlFor={id} className={cx('ui-field__label', hideLabel && 'ui-sr-only')}>
        {label}
      </label>
      <FieldContext.Provider value={{ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <span id={messageId} className="ui-field__error">
          <Icon name="alert" />
          {error}
        </span>
      ) : (
        hint && (
          <span id={messageId} className="ui-field__hint">
            {hint}
          </span>
        )
      )}
    </div>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx('ui-input', className)} {...props} {...useFieldControl(props)} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cx('ui-input', 'ui-textarea', className)} {...props} {...useFieldControl(props)} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <span className="ui-select">
      <select className={cx('ui-input', className)} {...props} {...useFieldControl(props)} />
    </span>
  )
}
