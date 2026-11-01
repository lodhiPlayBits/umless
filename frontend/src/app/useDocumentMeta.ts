import { useEffect } from 'react'
import type { RouteDef } from '@/app/routes'
import { SITE_DESCRIPTION } from '@/content/marketing'

const SITE_ORIGIN = 'https://umless.in'

function headTag<T extends HTMLMetaElement | HTMLLinkElement>(selector: string, create: () => T): T {
  const existing = document.querySelector<T>(selector)
  if (existing) return existing
  const made = create()
  document.head.append(made)
  return made
}

/**
 * Sets the tab title ("Pricing · umless"), the meta description and the canonical URL for the
 * current route. Google renders the app before indexing, so these reach search; the static
 * og:* tags in index.html are what non-JS link-preview scrapers read.
 */
export function useDocumentMeta(route: RouteDef, pathname: string) {
  useEffect(() => {
    document.title = route.id === 'landing' ? 'umless · Say less um' : `${route.title} · umless`

    const meta = headTag<HTMLMetaElement>('meta[name="description"]', () => {
      const tag = document.createElement('meta')
      tag.name = 'description'
      return tag
    })
    meta.content = route.description ?? SITE_DESCRIPTION

    // One canonical URL per page: no query string, no trailing slash except on the landing page.
    const canonical = headTag<HTMLLinkElement>('link[rel="canonical"]', () => {
      const tag = document.createElement('link')
      tag.rel = 'canonical'
      return tag
    })
    canonical.href = `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`
  }, [route, pathname])
}
