import { QueryClient } from '@tanstack/react-query'

/**
 * Server data shared between screens (docs/adr/0005-frontend-v2-architecture.md decision 4).
 *
 * One client for the app. Hooks pass it to useQuery explicitly, so they work in any render
 * (including tests) without a provider, and non-React code (the purchase flow, sign-out) changes
 * the same cache. Each feature's model/ owns its query keys and hooks; screens never use raw keys.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Failures show a banner with Retry (ADR 0002); silent retries would hide them for seconds.
      retry: false,
      // Screens refetch when they mount; a focus refetch would surprise someone mid-edit.
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
})

/** How long a screen's first load may take before it shows the error (docs/design/flows.md F1). */
export const LOAD_TIMEOUT_MS = 10_000

/** A signal that aborts when `signal` does or after `ms`, whichever is first (ADR 0002 decision 5). */
export function withTimeout(signal: AbortSignal | undefined, ms: number = LOAD_TIMEOUT_MS): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms)
  const stop = () => {
    clearTimeout(timer)
    controller.abort(signal?.reason)
  }
  if (signal?.aborted) stop()
  else signal?.addEventListener('abort', stop, { once: true })
  return controller.signal
}

/** Forget every user's data: signing out must leave nothing for the next person on this browser. */
export function clearServerData() {
  queryClient.clear()
}
