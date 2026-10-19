import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface DialogChoice {
  label: string
  onClick: () => void
  style?: 'primary' | 'danger'
}

interface ChoiceDialogProps {
  title: string
  children: ReactNode
  /** The first choice gets focus and is what Esc or a click outside picks, so make it the safe one. */
  choices: DialogChoice[]
}

/** Modal alert dialog: focus starts on the first (safe) choice, Esc or a click outside picks it, Tab stays inside. */
export default function ChoiceDialog({ title, children, choices }: ChoiceDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  const dismiss = choices[0].onClick

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    firstRef.current?.focus()
    return () => {
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      dismiss()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button')
    if (!buttons?.length) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && dismiss()}>
      <div
        ref={dialogRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId}>{title}</h2>
        <div id={descriptionId} className="muted">
          {children}
        </div>
        <div className="actions">
          {choices.map((choice, index) => (
            <button
              key={choice.label}
              ref={index === 0 ? firstRef : undefined}
              type="button"
              className={choice.style ? `btn btn-${choice.style}` : 'btn'}
              onClick={choice.onClick}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
