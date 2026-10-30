import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/client'
import { PaymentFailedError } from '../model/checkout'
import { resetAccount, setAccount, useAccount } from '../model/account'
import type { Account } from '../api/billingApi'
import BuyTime from './BuyTime'

const packs: Account['packs'] = [
  { id: 'session_1', label: '1 session · 60 minutes', seconds: 3600, amount_paise: 4000, currency: 'INR' },
  { id: 'session_5', label: '5 sessions · 300 minutes', seconds: 18000, amount_paise: 12000, currency: 'INR' },
]
const outOfTime: Account = { metered: true, free_transcriptions_left: 0, seconds_left: 0, packs }

function Balance() {
  const { account } = useAccount()
  return <p data-testid="balance">{account?.seconds_left}</p>
}

function setup(buyPack = vi.fn()) {
  const onDone = vi.fn()
  render(
    <>
      <Balance />
      <BuyTime onDone={onDone} buyPack={buyPack} />
    </>,
  )
  return { onDone, buyPack, user: userEvent.setup(), dialog: () => screen.getByRole('alertdialog') }
}

beforeEach(() => setAccount(outOfTime))
afterEach(() => resetAccount())

describe('BuyTime', () => {
  it('offers both packs with their prices, and Not now first', () => {
    const s = setup()
    const buttons = within(s.dialog()).getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['Not now', '1 session · 60 minutes · ₹40', '5 sessions · 300 minutes · ₹120'])
  })

  it('buys a pack, updates the balance everywhere and reports what was added', async () => {
    const s = setup(vi.fn().mockResolvedValue({ status: 'paid', account: { ...outOfTime, seconds_left: 18000 } }))
    await s.user.click(within(s.dialog()).getByRole('button', { name: /5 sessions/ }))

    expect(s.buyPack).toHaveBeenCalledWith('session_5')
    expect(s.onDone).toHaveBeenCalledWith('Added 5 h of practice time.')
    expect(screen.getByTestId('balance')).toHaveTextContent('18000')
  })

  it('comes back to the choices when Checkout is closed', async () => {
    const s = setup(vi.fn().mockResolvedValue({ status: 'cancelled' }))
    await s.user.click(within(s.dialog()).getByRole('button', { name: /1 session/ }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(s.onDone).not.toHaveBeenCalled()
  })

  it('explains a payment the server could not confirm', async () => {
    const s = setup(vi.fn().mockRejectedValue(new ApiError('x', 400, 'payment_invalid')))
    await s.user.click(within(s.dialog()).getByRole('button', { name: /1 session/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't be confirmed")
    expect(s.onDone).not.toHaveBeenCalled()
  })

  it('shows why a payment failed in Checkout', async () => {
    const s = setup(vi.fn().mockRejectedValue(new PaymentFailedError('Your card was declined')))
    await s.user.click(within(s.dialog()).getByRole('button', { name: /1 session/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Payment failed: Your card was declined. You weren't charged")
  })

  it('Not now closes without buying', async () => {
    const s = setup()
    await s.user.click(within(s.dialog()).getByRole('button', { name: 'Not now' }))
    expect(s.onDone).toHaveBeenCalledWith(null)
    expect(s.buyPack).not.toHaveBeenCalled()
  })
})
