import { Suspense, lazy, useEffect } from 'react'
import type { ComponentType } from 'react'
import { accessRedirect, layoutFor, renderStatus } from '@/app/access'
import type { LayoutId } from '@/app/access'
import AuthLayout from '@/app/layouts/AuthLayout'
import MarketingLayout from '@/app/layouts/MarketingLayout'
import type { LayoutProps } from '@/app/layouts/types'
import RoutePage from '@/app/RoutePage'
import { resolveRoute } from '@/app/routes'
import { useDocumentMeta } from '@/app/useDocumentMeta'
import { useSession } from '@/shared/lib/session'
import { clearServerData } from '@/shared/api/query'
import { currentPath, navigate, usePathname, useSearchParam } from '@/shared/lib/router'

// The app shell brings the sidebar, billing and checkout code: visitors on the public site don't
// download it until they sign in.
const AppShell = lazy(() => import('@/app/layouts/AppShell'))

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
  const session = useSession()
  const resolved = resolveRoute(pathname)
  const status = renderStatus(resolved.route, session)
  const redirect = accessRedirect(resolved.route, status, currentPath(), redirectParam)

  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true, force: true })
  }, [redirect])

  useDocumentMeta(resolved.route, pathname)

  // The next person to sign in on this browser must not see the last one's questions, takes or time.
  useEffect(() => {
    if (session.status === 'signedOut') clearServerData()
  }, [session.status])

  if (status === 'loading' || redirect) return <Loading />
  const Layout = LAYOUTS[layoutFor(resolved.route, status)]
  return (
    <Suspense fallback={<Loading />}>
      <Layout route={resolved.route}>
        <RoutePage resolved={resolved} pathname={pathname} />
      </Layout>
    </Suspense>
  )
}

export default App
