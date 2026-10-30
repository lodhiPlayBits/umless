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

export type LayoutId = 'app' | 'marketing' | 'auth'

/** The layout a route renders in; 'auto' routes (not found) follow the session. */
export function layoutFor(route: RouteDef, status: Session['status']): LayoutId {
  if (route.layout !== 'auto') return route.layout
  return status === 'signedIn' ? 'app' : 'marketing'
}
