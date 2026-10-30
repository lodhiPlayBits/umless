import type { ComponentProps } from 'react'
import { ICON_PATHS } from './iconPaths'
import type { IconName } from './iconPaths'
import './Icon.css'

export type { IconName }

type IconProps = Omit<ComponentProps<'svg'>, 'children'> & {
  name: IconName
  /** Set when the icon is the only content of its control; otherwise it's hidden from screen readers. */
  label?: string
}

export default function Icon({ name, label, className = '', ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`ui-icon ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...props}
    >
      {ICON_PATHS[name]}
    </svg>
  )
}
