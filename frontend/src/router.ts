import { useEffect, useSyncExternalStore } from 'react'

// A small router on the History API: the app has only three kinds of page (docs/design/screens.md).
export type Route =
  | { name: 'questions' }
  | { name: 'practice'; questionId: string }
  | { name: 'notFound' }

export function parseRoute(pathname: string): Route {
  if (pathname === '/') return { name: 'questions' }
  const practice = /^\/practice\/([^/]+)\/?$/.exec(pathname)
  if (practice) {
    try {
      return { name: 'practice', questionId: decodeURIComponent(practice[1]) }
    } catch {
      return { name: 'notFound' } // malformed percent-encoding
    }
  }
  return { name: 'notFound' }
}

export function practicePath(questionId: string): string {
  return `/practice/${encodeURIComponent(questionId)}`
}

/** Returns true to stop a navigation; it then owns it (e.g. asks, then calls navigate(path, { force: true })). */
type Blocker = (path: string) => boolean

const listeners = new Set<() => void>()
let blocker: Blocker | null = null
let currentPath = window.location.pathname

function notify() {
  currentPath = window.location.pathname
  listeners.forEach((listener) => listener())
}

window.addEventListener('popstate', () => {
  const target = window.location.pathname
  if (target !== currentPath && blocker?.(target)) {
    // Back/forward already happened; put the guarded page back until the user decides.
    window.history.pushState(null, '', currentPath)
    return
  }
  notify()
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function navigate(path: string, { force = false } = {}) {
  if (path === window.location.pathname) return
  if (!force && blocker?.(path)) return
  window.history.pushState(null, '', path)
  notify()
}

/** The current pathname, re-rendering on navigate() and on back/forward. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/**
 * While `onBlocked` is set, in-app navigation (links, back/forward) calls it with the target
 * path instead of leaving, and closing or reloading the tab shows the browser's own prompt.
 */
export function useNavigationGuard(onBlocked: ((path: string) => void) | null) {
  useEffect(() => {
    if (!onBlocked) return
    blocker = (path) => {
      onBlocked(path)
      return true
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = '' // still needed by some browsers to show the prompt
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => {
      blocker = null
      window.removeEventListener('beforeunload', beforeUnload)
    }
  }, [onBlocked])
}
