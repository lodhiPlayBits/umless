import { ApiError } from './client'

/** docs/adr/0002-frontend-architecture.md: every screen sorts a failed request into one of these. */
export type ApiErrorKind = 'unreachable' | 'validation' | 'server'

export const UNREACHABLE_TITLE = "Can't reach the umless server"

export function classifyApiError(error: unknown): ApiErrorKind {
  if (!(error instanceof ApiError)) return 'unreachable'
  // No error code on a 5xx means the dev proxy answered: the backend isn't running.
  if (error.status === 0 || (error.code === undefined && error.status >= 500)) return 'unreachable'
  if (error.code === 'validation_error') return 'validation'
  return 'server'
}
