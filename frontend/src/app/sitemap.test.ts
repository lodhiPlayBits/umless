import { describe, expect, it } from 'vitest'
// Vite reads the two files it ships verbatim, so the test checks what production actually serves.
import robotsTxt from '../../public/robots.txt?raw'
import sitemapXml from '../../public/sitemap.xml?raw'
import { ROUTES } from '@/app/routes'

const SITE_ORIGIN = 'https://umless.in'
/** Not in the sitemap: the auth pages only render a sign-in shell, and the style guide is dev-only. */
const EXCLUDED = new Set(['signIn', 'signUp', 'styleGuide'])

function sitemapLocs(): string[] {
  return [...sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
}

describe('sitemap.xml', () => {
  it('lists exactly the public routes from the route table', () => {
    const expected = ROUTES.filter(
      (route) => (route.access === 'public' || route.access === 'signedOut') && !EXCLUDED.has(route.id),
    )
      .map((route) => `${SITE_ORIGIN}${route.pattern}`)
      .sort()
    expect(sitemapLocs().sort()).toEqual(expected)
  })

  it('has no URL patterns with parameters', () => {
    expect(sitemapLocs().filter((loc) => loc.slice(SITE_ORIGIN.length).includes(':'))).toEqual([])
  })

  it('is referenced by robots.txt', () => {
    expect(robotsTxt).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`)
  })
})
