import { describe, expect, it } from 'vitest'
import { NOT_FOUND, ROUTES, navRoutes, resolveRoute, routeById } from '@/app/routes'
import { PATHS, practicePath } from '@/shared/config/paths'

const resolve = (pathname: string) => {
  const { route, params } = resolveRoute(pathname)
  return { id: route.id, params }
}

describe('resolveRoute', () => {
  it('maps the site and app pages', () => {
    expect(resolve('/').id).toBe('landing')
    expect(resolve('/pricing').id).toBe('pricing')
    expect(resolve('/sign-in').id).toBe('signIn')
    expect(resolve('/sign-up').id).toBe('signUp')
    expect(resolve('/questions')).toEqual({ id: 'questions', params: {} })
    expect(resolve('/settings').id).toBe('settings')
  })

  it('maps /practice/<id> to the practice page, percent-decoding the id', () => {
    expect(resolve('/practice/abc123')).toEqual({ id: 'practice', params: { questionId: 'abc123' } })
    expect(resolve('/practice/a%20b%2Fc')).toEqual({ id: 'practice', params: { questionId: 'a b/c' } })
  })

  it('treats malformed percent-encoding as not found', () => {
    expect(resolve('/practice/%E0%A4%A').id).toBe('notFound')
  })

  it('maps the legal pages, with or without a trailing slash, and they are public', () => {
    expect(resolve('/terms')).toEqual({ id: 'legal-terms', params: { page: 'terms' } })
    expect(resolve('/privacy/')).toEqual({ id: 'legal-privacy', params: { page: 'privacy' } })
    expect(resolve('/refunds')).toEqual({ id: 'legal-refunds', params: { page: 'refunds' } })
    expect(resolve('/contact')).toEqual({ id: 'legal-contact', params: { page: 'contact' } })
    expect(resolve('/terms/x').id).toBe('notFound')
    expect(resolveRoute('/terms').route.access).toBe('public')
  })

  it('treats unknown paths as not found', () => {
    for (const path of ['/nope', '/practice', '/practice/', '/practice/a/b']) expect(resolve(path).id).toBe('notFound')
    expect(resolveRoute('/nope').route).toBe(NOT_FOUND)
  })

  it('keeps app pages behind sign-in and the landing and sign-in pages for signed-out visitors', () => {
    expect(resolveRoute('/questions').route.access).toBe('signedIn')
    expect(resolveRoute('/practice/a').route.access).toBe('signedIn')
    expect(resolveRoute('/settings').route.access).toBe('signedIn')
    expect(resolveRoute('/').route.access).toBe('signedOut')
    expect(resolveRoute('/sign-in').route.access).toBe('signedOut')
    expect(resolveRoute('/pricing').route.access).toBe('public')
  })
})

describe('route table', () => {
  it('has unique ids and patterns', () => {
    expect(new Set(ROUTES.map((r) => r.id)).size).toBe(ROUTES.length)
    expect(new Set(ROUTES.map((r) => r.pattern)).size).toBe(ROUTES.length)
  })

  it('lists the nav in order; every nav route is an app page', () => {
    expect(navRoutes().map((r) => r.id)).toEqual(['questions', 'settings'])
    for (const route of navRoutes()) expect(route.layout).toBe('app')
  })

  it('every parent exists', () => {
    for (const route of ROUTES) if (route.parent) expect(routeById(route.parent)).toBeDefined()
  })

  it('app pages are signed-in only; sign-in pages use the auth layout', () => {
    for (const route of ROUTES) {
      if (route.layout === 'app') expect(route.access).toBe('signedIn')
      if (route.layout === 'auth') expect(route.access).toBe('signedOut')
    }
  })
})

describe('practicePath', () => {
  it('encodes the id and round-trips through resolveRoute', () => {
    expect(practicePath('abc')).toBe('/practice/abc')
    const path = practicePath('a b/c?')
    expect(path).toBe('/practice/a%20b%2Fc%3F')
    expect(resolve(path)).toEqual({ id: 'practice', params: { questionId: 'a b/c?' } })
  })

  it('every PATHS entry without params resolves to its own route', () => {
    for (const path of Object.values(PATHS)) if (!path.includes(':')) expect(resolveRoute(path).route.pattern).toBe(path)
  })
})
