import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/client'
import * as billingApi from '../api/billingApi'
import type { Account } from '../api/billingApi'
import { PaymentFailedError } from '../model/checkout'
import { purchaseErrorMessage } from '../model/usePurchase'
import BillingPanel from './BillingPanel'
import OutOfTimeBanner from './OutOfTimeBanner'
import PurchaseHistory from './PurchaseHistory'

vi.mock('../api/billingApi', async (importOriginal) => ({
  ...(await importOriginal<typeof billingApi>()),
  getAccount: vi.fn(),
  listPurchases: vi.fn(),
}))
const getAccount = vi.mocked(billingApi.getAccount)
const listPurchases = vi.mocked(billingApi.listPurchases)

const packs: Account['packs'] = [
  { id: 'session_1', label: '1 session', seconds: 3600, amount_paise: 4000, currency: 'INR' },
  { id: 'session_5', label: '5 sessions', seconds: 18000, amount_paise: 12000, currency: 'INR' },
]
const account = (free: number, seconds: number, metered = true): Account => ({ metered, free_transcriptions_left: free, seconds_left: seconds, packs })

beforeEach(() => {
  getAccount.mockReset()
  listPurchases.mockReset().mockResolvedValue([])
})

describe('BillingPanel', () => {
  it('shows what is left and every pack, the cheaper per minute marked best value', async () => {
    getAccount.mockResolvedValue(account(2, 0))
    render(<BillingPanel buyPack={vi.fn()} />)
    expect(await screen.findByText('2 free left')).toBeInTheDocument()
    expect(screen.getByText('None')).toBeInTheDocument()
    const best = screen.getByText('Best value').closest('li')!
    expect(within(best).getByRole('button', { name: 'Buy 5 sessions' })).toHaveClass('ui-button--primary')
    expect(screen.getByText(/₹0\.67 \/ min/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Refund & Cancellation Policy' })).toHaveAttribute('href', '/refunds')
    expect(screen.getByRole('link', { name: /See all your purchases/ })).toHaveAttribute('href', '/purchases')
  })

  it('a payment that worked says so, with the new balance', async () => {
    getAccount.mockResolvedValue(account(0, 0))
    const buyPack = vi.fn().mockResolvedValue({ status: 'paid', account: account(0, 18000) })
    render(<BillingPanel buyPack={buyPack} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy 5 sessions' }))
    expect(buyPack).toHaveBeenCalledWith('session_5')
    expect(await screen.findByText('Payment worked.')).toBeInTheDocument()
    expect(screen.getByText(/Added 5 h of practice time\. You now have 5 h of paid practice time\./)).toBeInTheDocument()
  })

  it('a payment that failed says so, and Try again buys the same pack', async () => {
    getAccount.mockResolvedValue(account(0, 0))
    const buyPack = vi.fn().mockRejectedValueOnce(new PaymentFailedError('Card declined')).mockResolvedValue({ status: 'cancelled' })
    render(<BillingPanel buyPack={buyPack} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy 1 session' }))
    expect(await screen.findByText("The payment didn't go through")).toBeInTheDocument()
    expect(screen.getByText(/Card declined\. You weren't charged/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(buyPack).toHaveBeenLastCalledWith('session_1')
  })

  it('a cancelled checkout leaves the page as it was', async () => {
    getAccount.mockResolvedValue(account(1, 0))
    render(<BillingPanel buyPack={vi.fn().mockResolvedValue({ status: 'cancelled' })} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Buy 1 session' }))
    expect(screen.queryByText('Payment worked.')).toBeNull()
    expect(screen.queryByText("The payment didn't go through")).toBeNull()
  })

  it('says so on a server without payments', async () => {
    getAccount.mockResolvedValue(account(0, 0, false))
    render(<BillingPanel buyPack={vi.fn()} />)
    expect(await screen.findByText("Practice time isn't counted here")).toBeInTheDocument()
  })
})

describe('Purchases', () => {
  const purchase = {
    order_id: 'order_1',
    payment_id: 'pay_Tu3lhmtObPkSdy',
    pack_id: 'session_1',
    label: '1 session · 60 minutes',
    seconds: 3600,
    amount_paise: 4000,
    currency: 'INR',
    paid_at: '2026-10-30T08:50:46Z',
  }

  it('lists each purchase with the time it added, the amount and its payment id', async () => {
    listPurchases.mockResolvedValue([purchase])
    render(<PurchaseHistory />)
    const list = await screen.findByRole('region', { name: 'Purchases' })
    expect(await within(list).findByText('1 session · 60 minutes · +1 h')).toBeInTheDocument()
    expect(within(list).getByText('pay_Tu3lhmtObPkSdy')).toBeInTheDocument()
    expect(within(list).getByText('₹40')).toBeInTheDocument()
  })

  it('says when there are none yet', async () => {
    render(<PurchaseHistory />)
    expect(await screen.findByText('No purchases yet')).toBeInTheDocument()
  })

  it('reloads after a payment on the Billing tab goes through', async () => {
    getAccount.mockResolvedValue(account(0, 0))
    listPurchases.mockResolvedValueOnce([]).mockResolvedValue([purchase])
    render(
      <>
        <BillingPanel buyPack={vi.fn().mockResolvedValue({ status: 'paid', account: account(0, 3600) })} />
        <PurchaseHistory />
      </>,
    )
    await screen.findByText('No purchases yet')
    await userEvent.click(screen.getByRole('button', { name: 'Buy 1 session' }))
    expect(await screen.findByText('pay_Tu3lhmtObPkSdy')).toBeInTheDocument()
  })
})

describe('OutOfTimeBanner', () => {
  it.each([
    [account(0, 0), true],
    [account(1, 0), false],
    [account(0, 60), false],
    [account(0, 0, false), false],
  ])('%j → shown: %s', async (acc, shown) => {
    getAccount.mockResolvedValue(acc)
    render(
      <>
        <OutOfTimeBanner showBuy />
        <span>loaded</span>
      </>,
    )
    await screen.findByText('loaded')
    if (shown) expect(await screen.findByText("You're out of practice time")).toBeInTheDocument()
    else expect(screen.queryByText("You're out of practice time")).toBeNull()
  })

  it('links to the billing tab', async () => {
    getAccount.mockResolvedValue(account(0, 0))
    render(<OutOfTimeBanner showBuy />)
    expect(await screen.findByRole('link', { name: 'Buy practice time' })).toHaveAttribute('href', '/settings/billing')
  })
})

describe('purchaseErrorMessage', () => {
  it.each([
    [new PaymentFailedError('Card declined'), "Payment failed: Card declined. You weren't charged; try again or use another method."],
    [new ApiError('x', 400, 'payment_invalid'), "Your payment couldn't be confirmed. If money left your account, it will be refunded by Razorpay."],
    [new Error('boom'), "The payment couldn't be completed. Try again in a moment."],
  ])('%s', (error, message) => {
    expect(purchaseErrorMessage(error)).toBe(message)
  })
})
