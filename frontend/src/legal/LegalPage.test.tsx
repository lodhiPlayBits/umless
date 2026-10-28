import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BUSINESS, LEGAL_PAGES } from './business'
import Footer from './Footer'
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
    expect(screen.getByText(/60 minutes of recording time for ₹40/)).toBeInTheDocument()
    expect(screen.getByText(/300 minutes of recording time for ₹120/)).toBeInTheDocument()
  })

  it('states the 7-day refund rule', () => {
    render(<LegalPage page="refunds" />)
    expect(screen.getByText('7 days')).toBeInTheDocument()
    expect(screen.getByText(/partly or fully used are not refundable/)).toBeInTheDocument()
  })

  it('lists the phone number on the contact page', () => {
    render(<LegalPage page="contact" />)
    expect(screen.getByRole('link', { name: BUSINESS.phone })).toHaveAttribute('href', 'tel:+918595007855')
  })
})

describe('Footer', () => {
  it('links every legal page', () => {
    render(<Footer />)
    const nav = screen.getByRole('navigation', { name: 'Legal' })
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/terms',
      '/privacy',
      '/refunds',
      '/contact',
    ])
  })
})
