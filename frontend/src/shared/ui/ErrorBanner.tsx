import type { ReactNode } from 'react'
import Banner from './Banner'

interface ErrorBannerProps {
  title: ReactNode
  /** One line under the title. */
  detail?: ReactNode
  /** Anything longer than a line, e.g. numbered steps. */
  children?: ReactNode
  actions?: ReactNode
}

/** The one error banner (docs/adr/0002-frontend-architecture.md): a danger <Banner>, read out at once. */
export default function ErrorBanner({ title, detail, children, actions }: ErrorBannerProps) {
  return (
    <Banner tone="danger" title={title} actions={actions}>
      {detail}
      {children}
    </Banner>
  )
}
