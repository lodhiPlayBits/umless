import type { ErrorInfo } from 'react'
import { sendClientError } from '@/shared/api/clientErrorsApi'
import type { ClientErrorReport } from '@/shared/api/clientErrorsApi'

type Kind = ClientErrorReport['kind']

// The contract's limits (ClientErrorReport); longer values are cut, not rejected.
const MAX_MESSAGE = 1000
const MAX_PATH = 500
const MAX_STACK = 10000
// One broken page can throw in a loop; the server also caps reports per user per hour.
const MAX_REPORTS_PER_PAGE = 5

const seen = new Set<string>()

/**
 * The one place errors are reported: the console, and for signed-in users the server log
 * (POST /api/client-errors), where an ERROR alerts. Never throws, whatever happens to the report.
 */
export function reportError(error: unknown, info?: ErrorInfo, kind: Kind = 'render') {
  console.error('umless error:', error, info?.componentStack ?? '')
  const report = toReport(error, kind, info?.componentStack ?? '')
  const key = `${report.message}\n${report.stack ?? ''}`
  if (seen.has(key) || seen.size >= MAX_REPORTS_PER_PAGE) return
  seen.add(key)
  // Nowhere left to report a failed report: the console already has the error.
  sendClientError(report).catch(() => {})
}

function toReport(error: unknown, kind: Kind, componentStack: string): ClientErrorReport {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const stack = error instanceof Error ? (error.stack ?? '') : ''
  // The pathname only: a query string can carry things that don't belong in a log.
  const path = globalThis.location?.pathname || '/'
  return {
    kind,
    message: (message || 'Unknown error').slice(0, MAX_MESSAGE),
    path: path.slice(0, MAX_PATH),
    stack: stack.slice(0, MAX_STACK),
    component_stack: componentStack.slice(0, MAX_STACK),
  }
}

/** For createRoot: React hands every render error, caught by a boundary or not, to reportError. */
export const rootErrorOptions = {
  onCaughtError: reportError,
  onUncaughtError: reportError,
}

/** "script-src blocked https://evil.example/x.js": the URL without its query string or hash. */
export function describeViolation(event: SecurityPolicyViolationEvent): string {
  const blocked = event.blockedURI.split(/[?#]/)[0] || 'unknown'
  return `${event.effectiveDirective || event.violatedDirective} blocked ${blocked}`
}

/**
 * Report errors outside React's rendering too: uncaught errors in event handlers and timers,
 * promises that reject with nothing to catch them, and Content-Security-Policy violations
 * (sent while the policy is Report-Only too, so it can be tuned before it's enforced).
 * Returns a function that stops listening.
 */
export function listenForUncaughtErrors(target: Window = window): () => void {
  function onError(event: ErrorEvent) {
    // "Script error." with no error object is a cross-origin script (an extension, a third-party
    // script) the browser won't describe: nothing in it to act on.
    if (!event.error && event.message === 'Script error.') return
    reportError(event.error ?? event.message, undefined, 'uncaught')
  }
  function onRejection(event: PromiseRejectionEvent) {
    reportError(event.reason, undefined, 'rejection')
  }
  function onViolation(event: SecurityPolicyViolationEvent) {
    reportError(`CSP ${describeViolation(event)}`, undefined, 'csp')
  }
  target.addEventListener('error', onError)
  target.addEventListener('unhandledrejection', onRejection)
  // Fired on the document and bubbles to window.
  target.addEventListener('securitypolicyviolation', onViolation)
  return () => {
    target.removeEventListener('error', onError)
    target.removeEventListener('unhandledrejection', onRejection)
    target.removeEventListener('securitypolicyviolation', onViolation)
  }
}
