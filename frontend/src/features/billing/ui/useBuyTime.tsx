import { useState } from 'react'
import Toast from '@/shared/ui/Toast'
import type { ToastMessage } from '@/shared/ui/Toast'
import BuyTime from './BuyTime'

/**
 * The "Buy practice time" dialog and the toast after it, for any button that opens it.
 * Returns `open` for the button and `ui` to render next to it.
 */
export function useBuyTime() {
  const [buying, setBuying] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const ui = (
    <>
      {buying && (
        <BuyTime
          onDone={(message) => {
            setBuying(false)
            if (message) setToast({ id: Date.now(), text: message })
          }}
        />
      )}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  )
  return { open: () => setBuying(true), ui }
}
