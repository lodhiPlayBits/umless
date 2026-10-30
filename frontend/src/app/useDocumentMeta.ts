import { useEffect } from 'react'
import type { RouteDef } from '@/app/routes'
import { SITE_DESCRIPTION } from '@/content/marketing'

/** Sets the tab title ("Pricing · umless") and the meta description for the current route. */
export function useDocumentMeta(route: RouteDef) {
  useEffect(() => {
    document.title = route.id === 'landing' ? 'umless · Say less um' : `${route.title} · umless`
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.append(meta)
    }
    meta.content = route.description ?? SITE_DESCRIPTION
  }, [route])
}
