import { Suspense } from 'react'
import { PageCrash } from '@/app/AppCrash'
import ScrollOnNavigate from '@/app/ScrollOnNavigate'
import type { ResolvedRoute } from '@/app/routes'
import { useHash } from '@/shared/lib/router'
import ErrorBoundary from '@/shared/ui/ErrorBoundary'

/** The matched route's page, loaded on demand. A crash, or a chunk that fails to load, stays inside it. */
export default function RoutePage({ resolved, pathname }: { resolved: ResolvedRoute; pathname: string }) {
  const { route, params } = resolved
  const Page = route.page
  const hash = useHash()
  return (
    // Keyed by path: navigating away from a crashed page clears the fallback.
    <ErrorBoundary key={pathname} fallback={<PageCrash showBack={route.id !== 'questions'} />}>
      <Suspense
        fallback={
          <p className="muted" role="status">
            Loading…
          </p>
        }
      >
        <Page key={pathname} params={params} />
        <ScrollOnNavigate pathname={pathname} hash={hash} />
      </Suspense>
    </ErrorBoundary>
  )
}
