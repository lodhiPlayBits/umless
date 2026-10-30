import type { ComponentProps } from 'react'
import { buttonClass } from './buttonClass'
import type { ButtonLook as Look, ButtonVariant } from './buttonClass'
import { cx } from './cx'
import Icon from './Icon'
import type { IconName } from './Icon'
import Link from './Link'

/** A native <button> with the design's look. Defaults to type="button", so it never submits a form by accident. */
export function Button({ variant, size, block, icon, className, type = 'button', children, ...props }: ComponentProps<'button'> & Look) {
  return (
    <button type={type} className={buttonClass({ variant, size, block }, className)} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

/** An in-app link that looks like a button. */
export function ButtonLink({ variant, size, block, icon, className, children, ...props }: ComponentProps<typeof Link> & Look) {
  return (
    <Link className={buttonClass({ variant, size, block }, className)} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  )
}

/** A round icon-only button. `label` is required: it is the button's accessible name. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  className,
  type = 'button',
  ...props
}: Omit<ComponentProps<'button'>, 'children'> & { icon: IconName; label: string; variant?: ButtonVariant }) {
  return (
    <button type={type} aria-label={label} title={label} className={cx(buttonClass({ variant }), 'ui-button--icon', className)} {...props}>
      <Icon name={icon} />
    </button>
  )
}
