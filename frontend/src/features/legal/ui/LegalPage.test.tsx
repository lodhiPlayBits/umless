import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BUSINESS, LEGAL_PAGES } from '@/content/business'
import LegalPage from './LegalPage'

describe('LegalPage', () => {
  it.each(LEGAL_PAGES)('$id shows its title, date and the contact email', ({ id, title }) => {
    render(<LegalPage page={id} />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: BUSINESS.email })[0]).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
  })

  it('states the prices on the terms and contact pages', () => {
    render(<LegalPage page="terms" />)
    expect(screen.getByText(/60 minutes of recording time for ₹49/)).toBeInTheDocument()
    expect(screen.getByText(/300 minutes of recording time for ₹199/)).toBeInTheDocument()
  })

  it('states the 3-day refund rule and that any use ends it', () => {
    render(<LegalPage page="refunds" />)
    expect(screen.getByText('3 days')).toBeInTheDocument()
    expect(screen.getByText(/if you use even one session \(or part of one\), none of it can be refunded/)).toBeInTheDocument()
    expect(screen.getByText(/free transcriptions don't count/)).toBeInTheDocument()
  })

  it('says how long backups keep data, on the privacy page', () => {
    render(<LegalPage page="privacy" />)
    expect(screen.getByText(/keep each backup for 30 days/)).toBeInTheDocument()
  })

  it('lists the phone number on the contact page', () => {
    render(<LegalPage page="contact" />)
    expect(screen.getByRole('link', { name: BUSINESS.phone })).toHaveAttribute('href', 'tel:+918595007855')
  })
})
