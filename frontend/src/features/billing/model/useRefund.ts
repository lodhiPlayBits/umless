import { useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { requestRefund as realRequestRefund } from '../api/billingApi'
import type { Purchase } from '../api/billingApi'
import { refreshAccountIfShown } from './account'
import { invalidatePurchases } from './usePurchases'

export type RefundOutcome = { kind: 'requested' | 'failed'; message: string }

/** What to tell the user when a refund can't be requested, by cause. */
export function refundErrorMessage(error: unknown): string {
  // The server says exactly why: already refunded, too old, time used, or Razorpay refused.
  if (error instanceof ApiError && (error.code === 'refund_not_allowed' || error.code === 'payment_provider_failed')) return error.message
  if (error instanceof ApiError && error.code === 'order_not_found') return "This purchase can't be found any more. Reload the page."
  return "The refund couldn't be requested. Check your connection and try again."
}

/**
 * Self-serve refund of an unused pack (docs/roadmap/2026-10-31-self-serve-refunds.md). On success the
 * purchases list and the balance reload: the pack's time is gone and the row reads "Refund in progress".
 */
export function useRefund(requestRefund: typeof realRequestRefund = realRequestRefund) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<RefundOutcome | null>(null)

  async function refund(purchase: Purchase) {
    setPendingId(purchase.order_id)
    setOutcome(null)
    try {
      await requestRefund(purchase.order_id)
      setOutcome({
        kind: 'requested',
        message: 'Razorpay returns the money to your original payment method in 5–7 working days. The pack\'s time has been removed.',
      })
    } catch (error) {
      setOutcome({ kind: 'failed', message: refundErrorMessage(error) })
    }
    // Either way the server may have changed something (or the list was stale): show what's true now.
    void invalidatePurchases()
    refreshAccountIfShown()
    setPendingId(null)
  }

  return { refund, pendingId, outcome, clearOutcome: () => setOutcome(null) }
}
