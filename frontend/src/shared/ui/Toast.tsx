import { useEffect } from 'react'
import './Toast.css'

export interface ToastMessage {
  /** Changes for every toast, so the same text shown twice restarts its timer. */
  id: number
  text: string
  action?: { label: string; onClick: () => void }
  /** Milliseconds before it hides itself. */
  duration?: number
}

interface ToastProps {
  toast: ToastMessage | null
  onDismiss: () => void
}

/** One toast at a time, announced politely. The live region stays mounted so screen readers hear it. */
export default function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(onDismiss, toast.duration ?? 4000)
    return () => window.clearTimeout(timer)
  }, [toast, onDismiss])

  return (
    <div role="status" aria-live="polite" className="ui-toast-region">
      {toast && (
        <div className="ui-toast">
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick()
                onDismiss()
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
