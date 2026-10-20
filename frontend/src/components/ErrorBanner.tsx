import type { ReactNode } from 'react'

interface ErrorBannerProps {
  title: ReactNode
  /** One line under the title. */
  detail?: ReactNode
  /** Anything longer than a line, e.g. numbered steps. */
  children?: ReactNode
  actions?: ReactNode
  icon?: string
}

/** The one error banner (docs/adr/0002-frontend-architecture.md); warn and info banners stay inline. */
export default function ErrorBanner({ title, detail, children, actions, icon = '⚠' }: ErrorBannerProps) {
  return (
    <div className="banner error" role="alert">
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        {detail !== undefined && <span className="small">{detail}</span>}
        {children}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </div>
  )
}
