import type { IconName } from './iconPaths'
import { cx } from './cx'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record'
export type ButtonSize = 'sm' | 'md' | 'lg'

export type ButtonLook = {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  /** An icon before the label. */
  icon?: IconName
}

/** The class list for a button look; also usable on elements that aren't a <Button>. */
export function buttonClass({ variant = 'secondary', size = 'md', block = false }: ButtonLook = {}, className?: string) {
  return cx('ui-button', `ui-button--${variant}`, size !== 'md' && `ui-button--${size}`, block && 'ui-button--block', className)
}
