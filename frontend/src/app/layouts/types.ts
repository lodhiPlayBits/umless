import type { ReactNode } from 'react'
import type { RouteDef } from '@/app/routes'

/** Every layout gets the matched route (for titles, nav state) and the page to frame. */
export type LayoutProps = { route: RouteDef; children: ReactNode }
