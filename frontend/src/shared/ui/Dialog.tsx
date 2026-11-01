import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './Dialog.css'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type DialogProps = {
  title: ReactNode
  children?: ReactNode
  /** The buttons at the bottom. */
  actions?: ReactNode
  /** Esc, or a click outside, calls this. Leave it out for a dialog that must be answered. */
  onDismiss?: () => void
  /** 'alertdialog' for a question that interrupts (delete, leave without saving). */
  role?: 'dialog' | 'alertdialog'
}

/**
 * A modal: focus moves to the first control inside and Tab stays inside; Esc or a click on the
 * backdrop dismisses it; on close, focus goes back where it was. Rendered into <body>: opened from
 * inside a container with its own stacking context (the sticky sidebar), its z-index would only
 * rank it within that container and the page would show through.
 */
export default function Dialog({ title, children, actions, onDismiss, role = 'dialog' }: DialogProps) {
  const titleId = useId()
  const bodyId = useId()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? ref.current)?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && onDismiss) {
      event.stopPropagation()
      onDismiss()
      return
    }
    if (event.key !== 'Tab') return
    const items = ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!items?.length) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="ui-overlay" onMouseDown={(event) => event.target === event.currentTarget && onDismiss?.()}>
      <div
        ref={ref}
        className="ui-dialog"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={children ? bodyId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="ui-dialog__title">
          {title}
        </h2>
        {children && (
          <div id={bodyId} className="ui-dialog__body">
            {children}
          </div>
        )}
        {actions && <div className="ui-dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
