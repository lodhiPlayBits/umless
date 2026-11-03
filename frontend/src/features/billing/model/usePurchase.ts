import { useState } from 'react'
import { PRICING } from '@/content/business'
import { ApiError } from '@/shared/api/client'
import type { Pack } from '../api/billingApi'
import { formatPracticeTime, setAccount } from './account'
import { PaymentFailedError } from './checkout'
import { buyPack as realBuyPack } from './purchase'
import { invalidatePurchases } from './usePurchases'

export type PurchaseOutcome = { kind: 'paid'; message: string } | { kind: 'failed'; message: string }

/** What to tell the user when a purchase fails, by cause. */
export function purchaseErrorMessage(error: unknown): string {
  if (error instanceof PaymentFailedError) return `${error.message}. You weren't charged; try again or use another method.`
  if (error instanceof ApiError && error.code === 'payment_invalid')
    return "Your payment couldn't be confirmed. If money left your account, it will be refunded by Razorpay."
  return "The payment couldn't be completed. Try again in a moment."
}

/** "₹40" from a pack's paise. */
export function packPrice(pack: Pack): string {
  return `₹${pack.amount_paise / 100}`
}

/**
 * The normal price to show crossed out during the launch offer, or null. Only when the server's
 * price is the offer price in content/business.ts, so a discount is never claimed that isn't charged.
 */
export function packWasPrice(pack: Pack): string | null {
  const listed = PRICING.packs.find((p) => p.id === pack.id)
  return listed?.wasPrice && listed.rupees * 100 === pack.amount_paise ? listed.wasPrice : null
}

/**
 * Buying a pack, for any screen that sells one: Razorpay Checkout covers the page while `paying`;
 * afterwards `outcome` says what happened, and a paid balance is already in the shared cache.
 * A cancelled checkout leaves no outcome.
 */
export function usePurchase(buyPack: typeof realBuyPack = realBuyPack) {
  const [paying, setPaying] = useState(false)
  const [outcome, setOutcome] = useState<PurchaseOutcome | null>(null)

  async function buy(pack: Pack): Promise<PurchaseOutcome | null> {
    setPaying(true)
    setOutcome(null)
    let result: PurchaseOutcome | null = null
    try {
      const purchase = await buyPack(pack.id)
      if (purchase.status === 'paid') {
        setAccount(purchase.account)
        void invalidatePurchases()
        result = { kind: 'paid', message: `Added ${formatPracticeTime(pack.seconds)} of practice time.` }
      }
    } catch (error) {
      result = { kind: 'failed', message: purchaseErrorMessage(error) }
    }
    setOutcome(result)
    setPaying(false)
    return result
  }

  return { buy, paying, outcome, clearOutcome: () => setOutcome(null) }
}
