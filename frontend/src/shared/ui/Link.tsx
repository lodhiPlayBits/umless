import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from '@/shared/lib/router'

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }

/** An in-app link: a real <a href> (so new-tab and copy-link work) that navigates without a reload. */
export default function Link({ to, onClick, ...props }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    if (event.defaultPrevented || event.button !== 0 || modified) return
    event.preventDefault()
    navigate(to)
  }

  return <a href={to} onClick={handleClick} {...props} />
}
