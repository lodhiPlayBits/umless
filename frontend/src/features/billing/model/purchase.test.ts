import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/client'
import type { Account, PaymentOrder } from '../api/billingApi'
import { buyPack } from './purchase'

const order: PaymentOrder = {
  order_id: 'order_1',
  key_id: 'rzp_test_key',
  amount_paise: 4000,
  currency: 'INR',
  pack_id: 'session_1',
  label: '1 session · 60 minutes',
}
const payment = { order_id: 'order_1', payment_id: 'pay_1', signature: 'sig' }
const account: Account = { metered: true, free_transcriptions_left: 0, seconds_left: 3600, packs: [] }

function steps(overrides = {}) {
  return {
    createOrder: vi.fn().mockResolvedValue(order),
    payWithCheckout: vi.fn().mockResolvedValue(payment),
    verifyPayment: vi.fn().mockResolvedValue(account),
    ...overrides,
  }
}

describe('buyPack', () => {
  it('orders, pays through Checkout and has the server verify the payment', async () => {
    const s = steps()
    await expect(buyPack('session_1', s)).resolves.toEqual({ status: 'paid', account })
    expect(s.createOrder).toHaveBeenCalledWith('session_1')
    expect(s.payWithCheckout).toHaveBeenCalledWith(order)
    expect(s.verifyPayment).toHaveBeenCalledWith(payment)
  })

  it('is cancelled when Checkout is closed without paying', async () => {
    const s = steps({ payWithCheckout: vi.fn().mockResolvedValue(null) })
    await expect(buyPack('session_1', s)).resolves.toEqual({ status: 'cancelled' })
    expect(s.verifyPayment).not.toHaveBeenCalled()
  })

  it('fails when the server rejects the payment', async () => {
    const s = steps({ verifyPayment: vi.fn().mockRejectedValue(new ApiError('x', 400, 'payment_invalid')) })
    await expect(buyPack('session_1', s)).rejects.toMatchObject({ code: 'payment_invalid' })
  })
})
