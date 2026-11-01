import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PoliciesPage from './PoliciesPage'

describe('PoliciesPage', () => {
  it('links every policy and the contact page', () => {
    render(<PoliciesPage />)
    expect(screen.getByRole('link', { name: /Refund & Cancellation Policy/ })).toHaveAttribute('href', '/refunds')
    expect(screen.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: /Terms & Conditions/ })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Contact us' })).toHaveAttribute('href', '/contact')
  })
})
