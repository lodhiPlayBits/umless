import { useState } from 'react'
import Toast from '../components/Toast'
import type { ToastMessage } from '../components/Toast'
import { practiceTimeLabel, useAccount } from './account'
import BuyTime from './BuyTime'

/** Header chip: free transcriptions or paid time left; opens Buy practice time. */
export default function PracticeTime() {
  const { account } = useAccount()
  const [buying, setBuying] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)

  if (!account?.metered) return null
  const label = practiceTimeLabel(account)
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost practice-time"
        aria-label={`Practice time: ${label}. Buy more`}
        onClick={() => setBuying(true)}
      >
        {label}
      </button>
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
}
