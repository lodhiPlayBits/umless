import { lazy } from 'react'
import type { ComponentType } from 'react'
import type { LayoutId } from '@/app/access'
import { FREE_TRANSCRIPTIONS, LEGAL_PAGES, PRICING } from '@/content/business'
import { SITE_DESCRIPTION } from '@/content/marketing'
import type { PageProps } from '@/pages/types'
import { PATHS } from '@/shared/config/paths'
import { matchPath } from '@/shared/lib/router'
import type { Params } from '@/shared/lib/router'
import type { IconName } from '@/shared/ui'

/**
 * Who may open a route. 'public': anyone (payment providers must read the legal pages without an
 * account). 'signedIn': behind sign-in. 'signedOut': landing and sign-in pages; signed-in users
 * are sent on to the app.
 */
export type Access = 'public' | 'signedIn' | 'signedOut'

export type RouteDef = {
  id: string
  pattern: string
  access: Access
  /** 'auto' follows the session: the app shell when signed in, the marketing site when not. */
  layout: LayoutId | 'auto'
  title: string
  /** The page's meta description, for search results and link previews (public pages). */
  description?: string
  /** Fixed params merged into the URL's :params, so one page component can serve many routes. */
  params?: Params
  page: ComponentType<PageProps>
  /** Listed in the app's sidebar and phone tab bar, in `order`. */
  nav?: { label: string; icon: IconName; order: number }
  /** The route this one sits under: the top bar shows it as a breadcrumb, and its nav item stays current. */
  parent?: string
  /** App pages: 'content' keeps the 720 px reading width, 'wide' uses the app width. */
  width?: 'content' | 'wide'
}

// Each page is its own chunk, loaded the first time its route renders.
const LandingPage = lazy(() => import('@/pages/LandingPage'))
const PricingPage = lazy(() => import('@/pages/PricingPage'))
const SignInPage = lazy(() => import('@/pages/SignInPage'))
const SignUpPage = lazy(() => import('@/pages/SignUpPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const QuestionsPage = lazy(() => import('@/pages/QuestionsPage'))
const PracticePage = lazy(() => import('@/pages/PracticePage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const QuestionHistoryPage = lazy(() => import('@/pages/QuestionHistoryPage'))
const TakePage = lazy(() => import('@/pages/TakePage'))
const LegalDocumentPage = lazy(() => import('@/pages/LegalDocumentPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

/**
 * Every page in the app (docs/adr/0005-frontend-v2-architecture.md decision 2). Adding a screen
 * is one row here plus one file in src/pages: the layouts, sidebar, tab bar and access rules all
 * read this table. The first matching row wins.
 */
export const ROUTES: readonly RouteDef[] = [
  {
    id: 'landing',
    pattern: PATHS.landing,
    access: 'signedOut',
    layout: 'marketing',
    title: 'Say less um',
    description: SITE_DESCRIPTION,
    page: LandingPage,
  },
  {
    id: 'pricing',
    pattern: PATHS.pricing,
    access: 'public',
    layout: 'marketing',
    title: 'Pricing',
    description: `${FREE_TRANSCRIPTIONS} free transcriptions, then practice time from ${PRICING.packs[0].price}. No subscription; time never expires.`,
    page: PricingPage,
  },
  { id: 'signIn', pattern: PATHS.signIn, access: 'signedOut', layout: 'auth', title: 'Log in', page: SignInPage },
  { id: 'signUp', pattern: PATHS.signUp, access: 'signedOut', layout: 'auth', title: 'Create your account', page: SignUpPage },
  {
    id: 'dashboard',
    pattern: PATHS.dashboard,
    access: 'signedIn',
    layout: 'app',
    title: 'Dashboard',
    page: DashboardPage,
    nav: { label: 'Dashboard', icon: 'home', order: 10 },
    width: 'wide',
  },
  {
    id: 'questions',
    pattern: PATHS.questions,
    access: 'signedIn',
    layout: 'app',
    title: 'Questions',
    page: QuestionsPage,
    nav: { label: 'Questions', icon: 'list', order: 20 },
  },
  { id: 'practice', pattern: PATHS.practice, access: 'signedIn', layout: 'app', title: 'Practice', page: PracticePage, parent: 'questions' },
  {
    id: 'history',
    pattern: PATHS.history,
    access: 'signedIn',
    layout: 'app',
    title: 'History',
    page: HistoryPage,
    nav: { label: 'History', icon: 'history', order: 30 },
    width: 'wide',
  },
  {
    id: 'questionHistory',
    pattern: PATHS.questionHistory,
    access: 'signedIn',
    layout: 'app',
    title: 'Progress',
    page: QuestionHistoryPage,
    parent: 'history',
    width: 'wide',
  },
  { id: 'take', pattern: PATHS.take, access: 'signedIn', layout: 'app', title: 'Take', page: TakePage, parent: 'history', width: 'wide' },
  {
    id: 'settings',
    pattern: PATHS.settings,
    access: 'signedIn',
    layout: 'app',
    title: 'Settings',
    page: SettingsPage,
    nav: { label: 'Settings', icon: 'settings', order: 90 },
    width: 'wide',
  },
  ...LEGAL_PAGES.map(
    (legal): RouteDef => ({
      id: `legal-${legal.id}`,
      pattern: `/${legal.id}`,
      access: 'public',
      layout: 'marketing',
      title: legal.title,
      params: { page: legal.id },
      page: LegalDocumentPage,
    }),
  ),
  // Dev-only living style guide; import.meta.env.DEV is false in production, so this row and its chunk are dropped.
  ...(import.meta.env.DEV
    ? [
        {
          id: 'styleGuide',
          pattern: '/_ui',
          access: 'public',
          layout: 'auto',
          title: 'Design system',
          page: lazy(() => import('@/pages/StyleGuidePage')),
          width: 'wide',
        } satisfies RouteDef,
      ]
    : []),
]

export const NOT_FOUND: RouteDef = {
  id: 'notFound',
  pattern: '*',
  access: 'public',
  layout: 'auto',
  title: 'Not found',
  page: NotFoundPage,
}

export type ResolvedRoute = { route: RouteDef; params: Params }

export function resolveRoute(pathname: string): ResolvedRoute {
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, pathname)
    if (params) return { route, params: { ...params, ...route.params } }
  }
  return { route: NOT_FOUND, params: {} }
}

export function routeById(id: string): RouteDef | undefined {
  return ROUTES.find((route) => route.id === id)
}

/** The sidebar and tab bar entries, in order. */
export function navRoutes(): RouteDef[] {
  return ROUTES.filter((route) => route.nav).sort((a, b) => a.nav!.order - b.nav!.order)
}
