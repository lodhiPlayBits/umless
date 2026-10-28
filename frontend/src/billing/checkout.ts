import type { PaymentOrder, PaymentVerify } from './billingApi'

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'

interface RazorpaySuccess {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

interface RazorpayFailure {
  error?: { description?: string; reason?: string }
}

interface RazorpayCheckout {
  open(): void
  on(event: 'payment.failed', handler: (response: RazorpayFailure) => void): void
}

/** The user closed Checkout after an attempt failed; `reason` is Razorpay's description of it. */
export class PaymentFailedError extends Error {
  name = 'PaymentFailedError'
  reason: string

  constructor(reason: string) {
    super(`Payment failed: ${reason}`)
    this.reason = reason
  }
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout
  }
}

let loading: Promise<void> | null = null

/** Razorpay's Checkout script, loaded on first use only. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error("Razorpay's checkout couldn't load"))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * Opens Razorpay Checkout for an order. Resolves with what the server needs to verify the
 * payment, or null if the user closed Checkout without trying to pay. A failed attempt stays
 * inside Checkout, which lets the user try another method; closing it after a failure rejects
 * with PaymentFailedError so the reason can be shown.
 */
export async function payWithCheckout(order: PaymentOrder): Promise<PaymentVerify | null> {
  await loadCheckout()
  return new Promise((resolve, reject) => {
    let lastFailure: string | null = null
    const checkout = new window.Razorpay!({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount_paise,
      currency: order.currency,
      name: 'umless',
      description: order.label,
      handler: (response: RazorpaySuccess) =>
        resolve({
          order_id: response.razorpay_order_id,
          payment_id: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        }),
      modal: {
        ondismiss: () => (lastFailure ? reject(new PaymentFailedError(lastFailure)) : resolve(null)),
        confirm_close: true,
      },
      // UPI first; the other methods enabled on the Razorpay account follow below it.
      config: {
        display: {
          blocks: { upi: { name: 'Pay with UPI', instruments: [{ method: 'upi' }] } },
          sequence: ['block.upi'],
          preferences: { show_default_blocks: true },
        },
      },
    })
    checkout.on('payment.failed', (response) => {
      lastFailure = response.error?.description || response.error?.reason || 'the payment was declined'
    })
    checkout.open()
  })
}
