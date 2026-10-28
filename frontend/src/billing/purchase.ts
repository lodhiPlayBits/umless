import { createOrder as realCreateOrder, verifyPayment as realVerifyPayment } from './billingApi'
import type { Account, PackId } from './billingApi'
import { payWithCheckout as realPayWithCheckout } from './checkout'

export type PurchaseResult = { status: 'paid'; account: Account } | { status: 'cancelled' }

export interface PurchaseSteps {
  createOrder: typeof realCreateOrder
  payWithCheckout: typeof realPayWithCheckout
  verifyPayment: typeof realVerifyPayment
}

const realSteps: PurchaseSteps = {
  createOrder: realCreateOrder,
  payWithCheckout: realPayWithCheckout,
  verifyPayment: realVerifyPayment,
}

/** Buy a pack: the server makes the order, Checkout takes the payment, the server verifies it. */
export async function buyPack(packId: PackId, steps: PurchaseSteps = realSteps): Promise<PurchaseResult> {
  const order = await steps.createOrder(packId)
  const payment = await steps.payWithCheckout(order)
  if (!payment) return { status: 'cancelled' }
  return { status: 'paid', account: await steps.verifyPayment(payment) }
}
