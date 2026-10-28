import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PaymentOrder } from './billingApi'
import { PaymentFailedError, payWithCheckout } from './checkout'

const order: PaymentOrder = {
  order_id: 'order_1',
  key_id: 'rzp_test_key',
  amount_paise: 4000,
  currency: 'INR',
  pack_id: 'session_1',
  label: '1 session · 60 minutes',
}

type Options = {
  key: string
  order_id: string
  handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void
  modal: { ondismiss: () => void }
  config: { display: { sequence: string[] } }
}

let options: Options
let failed: ((r: { error?: { description?: string } }) => void) | undefined

beforeEach(() => {
  failed = undefined
  // A stand-in for Razorpay's script: records the options and the payment.failed handler.
  window.Razorpay = vi.fn(function (this: unknown, o: Record<string, unknown>) {
    options = o as unknown as Options
    return {
      open: vi.fn(),
      on: (_event: string, handler: typeof failed) => {
        failed = handler
      },
    }
  }) as unknown as typeof window.Razorpay
})

afterEach(() => {
  delete window.Razorpay
})

describe('payWithCheckout', () => {
  it('opens Checkout for the order with UPI first, and returns what the server verifies', async () => {
    const paid = payWithCheckout(order)
    await vi.waitFor(() => expect(options).toBeDefined())
    expect(options.key).toBe('rzp_test_key')
    expect(options.order_id).toBe('order_1')
    expect(options.config.display.sequence).toEqual(['block.upi'])

    options.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'sig' })
    await expect(paid).resolves.toEqual({ order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' })
  })

  it('resolves null when closed without trying to pay', async () => {
    const paid = payWithCheckout(order)
    await vi.waitFor(() => expect(options).toBeDefined())
    options.modal.ondismiss()
    await expect(paid).resolves.toBeNull()
  })

  it('rejects with the failure reason when closed after a failed attempt', async () => {
    const paid = payWithCheckout(order)
    await vi.waitFor(() => expect(failed).toBeDefined())
    failed!({ error: { description: 'Your card was declined' } })
    options.modal.ondismiss()

    const error = await paid.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PaymentFailedError)
    expect((error as PaymentFailedError).reason).toBe('Your card was declined')
  })

  it('still succeeds when a later attempt pays', async () => {
    const paid = payWithCheckout(order)
    await vi.waitFor(() => expect(failed).toBeDefined())
    failed!({ error: { description: 'UPI request rejected' } })
    options.handler({ razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_2', razorpay_signature: 'sig' })
    await expect(paid).resolves.toMatchObject({ payment_id: 'pay_2' })
  })
})
