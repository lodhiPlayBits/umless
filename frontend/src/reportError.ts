import type { ErrorInfo } from 'react'

/** The one place errors are reported. umless runs locally for one person, so the console is enough. */
export function reportError(error: unknown, info?: ErrorInfo) {
  console.error('umless error:', error, info?.componentStack ?? '')
}

/** For createRoot: React hands every render error, caught by a boundary or not, to reportError. */
export const rootErrorOptions = {
  onCaughtError: reportError,
  onUncaughtError: reportError,
}
