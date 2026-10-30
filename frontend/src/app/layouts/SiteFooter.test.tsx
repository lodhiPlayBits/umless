import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BUSINESS } from '@/content/business'
import SiteFooter from './SiteFooter'

describe('SiteFooter', () => {
  it('links every legal page (payment providers check them without an account)', () => {
    render(<SiteFooter />)
    const nav = screen.getByRole('navigation', { name: 'Legal' })
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/terms', '/privacy', '/refunds', '/contact'])
  })

  it('links pricing and the contact email', () => {
    render(<SiteFooter />)
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/pricing')
    expect(screen.getByRole('link', { name: BUSINESS.email })).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
  })
})
