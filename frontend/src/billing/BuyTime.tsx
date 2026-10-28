import { useState } from 'react'
import { ApiError } from '../client'
import ChoiceDialog from '../components/ChoiceDialog'
import { formatPracticeTime, setAccount, useAccount } from './account'
import type { Pack } from './billingApi'
import { PaymentFailedError } from './checkout'
import { buyPack as realBuyPack } from './purchase'

function rupees(pack: Pack): string {
  return `₹${pack.amount_paise / 100}`
}

interface BuyTimeProps {
  /** Called once: with a message after a payment, or null if the user backed out. */
  onDone: (message: string | null) => void
  buyPack?: typeof realBuyPack
}

/** Pick a pack, then Razorpay Checkout takes over the screen until the payment is done. */
export default function BuyTime({ onDone, buyPack = realBuyPack }: BuyTimeProps) {
  const { account } = useAccount()
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buy(pack: Pack) {
    setPaying(true)
    setError(null)
    try {
      const result = await buyPack(pack.id)
      if (result.status === 'paid') {
        setAccount(result.account)
        onDone(`Added ${formatPracticeTime(pack.seconds)} of practice time.`)
        return
      }
    } catch (e) {
      setError(
        e instanceof PaymentFailedError
          ? `${e.message}. You weren't charged; try again or use another method.`
          : e instanceof ApiError && e.code === 'payment_invalid'
            ? "Your payment couldn't be confirmed. If money left your account, it will be refunded by Razorpay."
            : "The payment couldn't be completed. Try again in a moment.",
      )
    }
    setPaying(false)
  }

  // Checkout is on screen; don't stack a dialog under it.
  if (paying) return null
  const packs = account?.packs ?? []
  return (
    <ChoiceDialog
      title="Buy practice time"
      choices={[
        { label: 'Not now', onClick: () => onDone(null) },
        ...packs.map((pack, index) => ({
          label: `${pack.label} · ${rupees(pack)}`,
          style: index === 0 ? ('primary' as const) : undefined,
          onClick: () => void buy(pack),
        })),
      ]}
    >
      <p>Each transcription uses up the length of your recording. Unused time never expires.</p>
      {packs.length === 0 && <p>Loading prices…</p>}
      {error && (
        <p className="field-msg error" role="alert">
          {error}
        </p>
      )}
    </ChoiceDialog>
  )
}
