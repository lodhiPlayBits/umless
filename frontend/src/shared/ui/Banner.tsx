import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'
import Icon from './Icon'
import type { IconName } from './Icon'
import './Banner.css'

export type BannerTone = 'info' | 'success' | 'warning' | 'danger'

const ICONS: Record<BannerTone, IconName> = { info: 'info', success: 'check', warning: 'alert', danger: 'alert' }

type BannerProps = Omit<ComponentProps<'div'>, 'title'> & {
  tone?: BannerTone
  title?: ReactNode
  /** Buttons under the text. */
  actions?: ReactNode
}

/**
 * A message across the page. Danger banners are alerts (read out at once); the others are
 * status messages. Pass `role` to override.
 */
export default function Banner({ tone = 'info', title, actions, className, children, ...props }: BannerProps) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('ui-banner', `ui-banner--${tone}`, className)} {...props}>
      <Icon name={ICONS[tone]} className="ui-banner__icon" />
      <div className="ui-banner__body">
        {title && <strong className="ui-banner__title">{title}</strong>}
        {children && <div className="ui-banner__text">{children}</div>}
        {actions && <div className="ui-banner__actions">{actions}</div>}
      </div>
    </div>
  )
}
