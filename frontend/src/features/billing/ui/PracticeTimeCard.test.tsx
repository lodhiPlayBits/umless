import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LAUNCH_OFFER, OFFER_LABEL, PRICING, TIME_NOTE } from '@/content/business'
import type { Account } from '../api/billingApi'
import { resetAccount, setAccount } from '../model/account'
import PracticeTimeCard from './PracticeTimeCard'

const account = (amounts: [number, number]): Account => ({
  metered: true,
  free_seconds_left: 3600,
  seconds_left: 7200,
  packs: [
    { id: 'session_1', label: '1 session · 60 minutes', seconds: 3600, amount_paise: amounts[0], currency: 'INR' },
    { id: 'session_5', label: '5 sessions · 300 minutes', seconds: 18000, amount_paise: amounts[1], currency: 'INR' },
  ],
})

afterEach(() => resetAccount())

describe('PracticeTimeCard', () => {
  it('shows the launch offer next to Buy time while the server charges the offer prices', () => {
    setAccount(account(PRICING.packs.map((p) => p.rupees * 100) as [number, number]))
    render(<PracticeTimeCard />)
    expect(screen.getByRole('button', { name: 'Buy time' })).toBeInTheDocument()
    if (LAUNCH_OFFER) expect(screen.getByText(OFFER_LABEL)).toBeInTheDocument()
    else expect(screen.queryByText(OFFER_LABEL)).not.toBeInTheDocument()
  })

  it('claims no offer when the server charges other prices', () => {
    setAccount(account([4000, 12000]))
    render(<PracticeTimeCard />)
    expect(screen.queryByText(OFFER_LABEL)).not.toBeInTheDocument()
  })
})

describe('PracticeTimeCard note', () => {
  it('says in one line how practice time can be used', () => {
    setAccount(account([4000, 12000]))
    render(<PracticeTimeCard />)
    expect(screen.getByText(TIME_NOTE)).toBeInTheDocument()
  })
})
