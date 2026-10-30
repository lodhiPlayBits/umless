import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FREE_TRANSCRIPTIONS, PRICING } from '@/content/business'
import { FAQ, pricingRows } from '@/content/marketing'
import { SessionContext } from '@/shared/lib/session'
import type { Session } from '@/shared/lib/session'
import { CompareTable, Faq, PricingCards } from '.'
import SampleTranscript from './ui/SampleTranscript'

const as = (status: Session['status'], ui: React.ReactNode) => <SessionContext.Provider value={{ auth: 'clerk', status }}>{ui}</SessionContext.Provider>

describe('SampleTranscript', () => {
  it('marks fillers and pause dots, and keeps the rest as text', () => {
    const { container } = render(<SampleTranscript text="So, um, I led it. ··· The uh hard part was mhmm umbrella." />)
    expect([...container.querySelectorAll('mark.filler')].map((m) => m.textContent)).toEqual(['um', 'uh', 'mhmm'])
    expect(screen.getByLabelText('3 second pause')).toHaveTextContent('···')
    expect(container).toHaveTextContent('umbrella.')
  })
})

describe('PricingCards', () => {
  it('shows the free allowance and every pack at the backend’s prices', () => {
    render(as('signedOut', <PricingCards />))
    expect(screen.getByRole('article', { name: 'Free' })).toHaveTextContent(`${FREE_TRANSCRIPTIONS} free transcriptions`)
    for (const pack of PRICING.packs) expect(screen.getByText(pack.price)).toBeInTheDocument()
  })

  it('marks the cheapest per minute as best value', () => {
    render(as('signedOut', <PricingCards />))
    const best = PRICING.packs.reduce((a, b) => (b.rupees / b.minutes < a.rupees / a.minutes ? b : a))
    expect(screen.getByText('Best value').closest('article')).toHaveTextContent(best.price)
  })

  it('sends visitors to sign up, and signed-in users to buy time in Settings', () => {
    const { unmount } = render(as('signedOut', <PricingCards />))
    for (const link of screen.getAllByRole('link', { name: 'Start free' })) expect(link).toHaveAttribute('href', '/sign-up')
    unmount()
    render(as('signedIn', <PricingCards />))
    expect(screen.getAllByRole('link', { name: 'Buy time' })).toHaveLength(PRICING.packs.length)
    for (const link of screen.getAllByRole('link', { name: 'Buy time' })) expect(link).toHaveAttribute('href', '/settings/billing')
  })
})

describe('CompareTable', () => {
  it('has a column per option and computes the price per minute', () => {
    render(<CompareTable />)
    expect(screen.getAllByRole('columnheader')).toHaveLength(2 + PRICING.packs.length)
    const row = screen.getByRole('row', { name: /Cost per minute/ })
    expect(within(row).getByText('₹0.67 / min')).toBeInTheDocument()
    expect(within(row).getByText('₹0.40 / min')).toBeInTheDocument()
  })

  it('every row has a cell for free and each pack', () => {
    for (const row of pricingRows()) expect(row.packs).toHaveLength(PRICING.packs.length)
  })
})

describe('Faq', () => {
  it('renders every question as a disclosure, the first one open', () => {
    const { container } = render(<Faq items={FAQ} />)
    const details = container.querySelectorAll('details')
    expect(details).toHaveLength(FAQ.length)
    expect(details[0]).toHaveAttribute('open')
    expect(details[1]).not.toHaveAttribute('open')
    expect(screen.getByText(FAQ[1].question)).toBeInTheDocument()
  })
})
