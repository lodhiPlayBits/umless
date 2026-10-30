import { useEffect } from 'react'

/**
 * Rendered next to the page inside its Suspense boundary, so it runs once the page is on screen:
 * a hash scrolls to that section (/#faq), otherwise a new page starts at the top.
 */
export default function ScrollOnNavigate({ pathname, hash }: { pathname: string; hash: string }) {
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null
    if (target) target.scrollIntoView?.({ block: 'start' })
    else if (!hash) window.scrollTo?.(0, 0)
  }, [pathname, hash])
  return null
}
