import { describe, expect, it } from 'vitest'
import { accessRedirect, layoutFor } from '@/app/access'
import { NOT_FOUND, resolveRoute } from '@/app/routes'
import { safeRedirect, signInPath } from '@/shared/config/paths'

const route = (path: string) => resolveRoute(path).route

describe('accessRedirect', () => {
  it('waits while the session loads', () => {
    expect(accessRedirect(route('/questions'), 'loading', '/questions', null)).toBeNull()
    expect(accessRedirect(route('/'), 'loading', '/', null)).toBeNull()
  })

  it('sends a signed-out visitor on an app page to sign in, coming back afterwards', () => {
    expect(accessRedirect(route('/practice/a'), 'signedOut', '/practice/a', null)).toBe('/sign-in?redirect=%2Fpractice%2Fa')
    expect(accessRedirect(route('/settings'), 'signedOut', '/settings', null)).toBe('/sign-in?redirect=%2Fsettings')
  })

  it('does not add a redirect back to home', () => {
    expect(accessRedirect(route('/dashboard'), 'signedOut', '/dashboard', null)).toBe('/sign-in')
    expect(accessRedirect(route('/questions'), 'signedOut', '/questions', null)).toBe('/sign-in?redirect=%2Fquestions')
  })

  it('sends a signed-in user from the landing or sign-in page into the app', () => {
    expect(accessRedirect(route('/'), 'signedIn', '/', null)).toBe('/dashboard')
    expect(accessRedirect(route('/sign-in'), 'signedIn', '/sign-in', null)).toBe('/dashboard')
  })

  it('honours a safe ?redirect= after signing in, and ignores an unsafe one', () => {
    expect(accessRedirect(route('/sign-in'), 'signedIn', '/sign-in?redirect=%2Fsettings', '/settings')).toBe('/settings')
    expect(accessRedirect(route('/sign-in'), 'signedIn', '/sign-in', '//evil.example')).toBe('/dashboard')
  })

  it('shows public pages to everyone, and app pages to signed-in users', () => {
    for (const status of ['signedIn', 'signedOut'] as const) {
      expect(accessRedirect(route('/terms'), status, '/terms', null)).toBeNull()
      expect(accessRedirect(route('/pricing'), status, '/pricing', null)).toBeNull()
      expect(accessRedirect(NOT_FOUND, status, '/nope', null)).toBeNull()
    }
    expect(accessRedirect(route('/questions'), 'signedIn', '/questions', null)).toBeNull()
  })
})

describe('layoutFor', () => {
  it('uses the route’s layout, and the session for not found', () => {
    expect(layoutFor(route('/questions'), 'signedIn')).toBe('app')
    expect(layoutFor(route('/pricing'), 'signedIn')).toBe('marketing')
    expect(layoutFor(route('/sign-in'), 'signedOut')).toBe('auth')
    expect(layoutFor(NOT_FOUND, 'signedIn')).toBe('app')
    expect(layoutFor(NOT_FOUND, 'signedOut')).toBe('marketing')
  })
})

describe('safeRedirect and signInPath', () => {
  it.each([
    ['/settings', '/settings'],
    ['/practice/a?x=1', '/practice/a?x=1'],
    ['//evil.example', null],
    ['/\\evil.example', null],
    ['https://evil.example', null],
    ['javascript:alert(1)', null],
    ['', null],
    [null, null],
  ])('safeRedirect(%j) is %j', (value, expected) => {
    expect(safeRedirect(value)).toBe(expected)
  })

  it('signInPath round-trips a return path', () => {
    expect(signInPath()).toBe('/sign-in')
    expect(signInPath('/dashboard')).toBe('/sign-in')
    expect(new URLSearchParams(signInPath('/practice/a b').split('?')[1]).get('redirect')).toBe('/practice/a b')
  })
})
