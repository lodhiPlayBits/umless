import type { RouteDef } from '@/app/routes'
import type { Session } from '@/shared/lib/session'
import { HOME_PATH, safeRedirect, signInPath } from '@/shared/config/paths'

/**
 * Where to send the visitor instead of `route`, or null to show it.
 * - A signed-in-only page, signed out: sign in, then come back here.
 * - A signed-out-only page (landing, sign-in, sign-up), signed in: the ?redirect= target or home.
 */
export function accessRedirect(route: RouteDef, status: Session['status'], here: string, redirectParam: string | null): string | null {
  if (status === 'loading') return null
  if (route.access === 'signedIn' && status === 'signedOut') return signInPath(here)
  if (route.access === 'signedOut' && status === 'signedIn') return safeRedirect(redirectParam) ?? HOME_PATH
  return null
}

/**
 * The status to render with. While the auth provider loads, a visitor with no session cookie is
 * treated as signed out on pages anyone may see, so the public site paints without waiting for it
 * (landing LCP). App pages, and anyone who may be signed in, still wait.
 */
export function renderStatus(route: RouteDef, session: Pick<Session, 'status' | 'maybeSignedIn'>): Session['status'] {
  if (session.status !== 'loading' || session.maybeSignedIn !== false) return session.status
  return route.access === 'signedIn' ? 'loading' : 'signedOut'
}

export type LayoutId = 'app' | 'marketing' | 'auth'

/** The layout a route renders in; 'auto' routes (not found) follow the session. */
export function layoutFor(route: RouteDef, status: Session['status']): LayoutId {
  if (route.layout !== 'auto') return route.layout
  return status === 'signedIn' ? 'app' : 'marketing'
}
