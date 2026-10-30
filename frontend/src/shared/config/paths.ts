import { buildPath } from '@/shared/lib/router'

/**
 * Every URL pattern in the app. Features build links from here, and src/app/routes.ts maps the
 * same patterns to pages, so a URL is defined once and features never import the route table.
 */
export const PATHS = {
  landing: '/',
  pricing: '/pricing',
  signIn: '/sign-in',
  signUp: '/sign-up',
  questions: '/questions',
  practice: '/practice/:questionId',
  settings: '/settings',
} as const

/** Where a signed-in user lands: the questions list until the dashboard exists (roadmap phase 8). */
export const HOME_PATH: string = PATHS.questions

export function practicePath(questionId: string): string {
  return buildPath(PATHS.practice, { questionId })
}

/** The sign-in page, coming back to `returnTo` afterwards. */
export function signInPath(returnTo?: string): string {
  return returnTo && returnTo !== HOME_PATH ? `${PATHS.signIn}?redirect=${encodeURIComponent(returnTo)}` : PATHS.signIn
}

/**
 * A ?redirect= value made safe to navigate to: only same-site paths ("/questions"), never
 * another origin ("//evil.example", "https://…") or a script URL. Anything else gives null.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}
