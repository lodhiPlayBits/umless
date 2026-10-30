import { useEffect } from 'react'
import type { ComponentType } from 'react'
import { accessRedirect, layoutFor } from '@/app/access'
import type { LayoutId } from '@/app/access'
import AppShell from '@/app/layouts/AppShell'
import AuthLayout from '@/app/layouts/AuthLayout'
import MarketingLayout from '@/app/layouts/MarketingLayout'
import type { LayoutProps } from '@/app/layouts/types'
import RoutePage from '@/app/RoutePage'
import { resolveRoute } from '@/app/routes'
import { useDocumentMeta } from '@/app/useDocumentMeta'
import { useSession } from '@/shared/lib/session'
import { clearServerData } from '@/shared/api/query'
import { currentPath, navigate, usePathname, useSearchParam } from '@/shared/lib/router'

const LAYOUTS: Record<LayoutId, ComponentType<LayoutProps>> = {
  app: AppShell,
  marketing: MarketingLayout,
  auth: AuthLayout,
}

function Loading() {
  return (
    <p className="muted loading-auth" role="status">
      Loading…
    </p>
  )
}

/**
 * Picks the page for the URL, checks who may see it, and frames it in its layout. Signing out
 * leaves the app's routes, so their components (and the questions in them) unmount.
 */
function App() {
  const pathname = usePathname()
  const redirectParam = useSearchParam('redirect')
  const { status } = useSession()
  const resolved = resolveRoute(pathname)
  const redirect = accessRedirect(resolved.route, status, currentPath(), redirectParam)

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true, force: true })
  }, [redirect])

  useDocumentMeta(resolved.route)

  // The next person to sign in on this browser must not see the last one's questions, takes or time.
  useEffect(() => {
    if (status === 'signedOut') clearServerData()
  }, [status])

  if (status === 'loading' || redirect) return <Loading />
  const Layout = LAYOUTS[layoutFor(resolved.route, status)]
  return (
    <Layout route={resolved.route}>
      <RoutePage resolved={resolved} pathname={pathname} />
    </Layout>
  )
}

export default App
