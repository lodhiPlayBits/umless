import { useEffect, useSyncExternalStore } from 'react'

// A small router on the History API. It knows nothing about umless's pages: the route table in
// src/app/routes.ts lists them (docs/adr/0005-frontend-v2-architecture.md decision 2).

export type Params = Record<string, string>

/**
 * Match a pattern such as '/practice/:questionId' against a pathname, ignoring one trailing slash.
 * Returns the decoded params, or null when it doesn't match. An empty segment or malformed
 * percent-encoding doesn't match, so it ends up as not found.
 */
export function matchPath(pattern: string, pathname: string): Params | null {
  const want = pattern.split('/')
  const got = (pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname).split('/')
  if (want.length !== got.length) return null
  const params: Params = {}
  for (let i = 0; i < want.length; i++) {
    if (!want[i].startsWith(':')) {
      if (want[i] !== got[i]) return null
      continue
    }
    if (!got[i]) return null
    try {
      params[want[i].slice(1)] = decodeURIComponent(got[i])
    } catch {
      return null
    }
  }
  return params
}

/** The path for a pattern, with each :param percent-encoded. */
export function buildPath(pattern: string, params: Params = {}): string {
  return pattern.replace(/:(\w+)/g, (_, name: string) => {
    if (!(name in params)) throw new Error(`buildPath: missing :${name} for ${pattern}`)
    return encodeURIComponent(params[name])
  })
}

/** Returns true to stop a navigation; it then owns it (e.g. asks, then calls navigate(path, { force: true })). */
type Blocker = (path: string) => boolean

const listeners = new Set<() => void>()
let blocker: Blocker | null = null
let lastPathname = window.location.pathname

function notify() {
  lastPathname = window.location.pathname
  listeners.forEach((listener) => listener())
}

window.addEventListener('popstate', () => {
  const target = window.location.pathname
  if (target !== lastPathname && blocker?.(target)) {
    // Back/forward already happened; put the guarded page back until the user decides.
    window.history.pushState(null, '', lastPathname)
    return
  }
  notify()
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current path with its query string and hash, e.g. "/sign-in?redirect=%2Fquestions". */
export function currentPath(): string {
  return window.location.pathname + window.location.search + window.location.hash
}

/**
 * Go to an in-app path. `replace` swaps the current history entry (redirects); `force` skips the
 * navigation guard (the guard's own "Leave" button uses it).
 */
export function navigate(path: string, { force = false, replace = false } = {}) {
  if (path === currentPath()) return
  if (!force && blocker?.(path)) return
  if (replace) window.history.replaceState(null, '', path)
  else window.history.pushState(null, '', path)
  notify()
}

/** The current pathname, re-rendering on navigate() and on back/forward. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}

/** The current query string's value for `name`, re-rendering when it changes. */
export function useSearchParam(name: string): string | null {
  return useSyncExternalStore(subscribe, () => new URLSearchParams(window.location.search).get(name))
}

/** The current hash ("#faq", or "" for none), re-rendering when it changes. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash)
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
