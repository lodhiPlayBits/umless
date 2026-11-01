/** Who runs umless, as published on the legal pages. Must match the Razorpay KYC details. */
export const BUSINESS = {
  name: 'Gaurav Lodhi',
  email: 'gauravlodhi983@gmail.com',
  phone: '+91 8595 007855',
  /** Postal address; shown on the Contact page once set. */
  address: null as string | null,
  site: 'https://umless.in',
}

export const LAST_UPDATED = '1 November 2026'

/**
 * The prices, in words. The server's price list (backend/app/billing/packs.py) is what's
 * charged; keep this in step with it.
 */
/** Free practice time for every new account, in minutes; the backend's FREE_SECONDS / 60 (app/billing/packs.py). */
export const FREE_MINUTES = 20

export const PRICING = {
  free: `${FREE_MINUTES} minutes of free practice time for every new account`,
  packs: [
    { name: '1 session', time: '60 minutes of recording time', price: '₹49', minutes: 60, rupees: 49 },
    { name: '5 sessions', time: '300 minutes of recording time', price: '₹199', minutes: 300, rupees: 199 },
  ],
}

export type LegalPageId = 'terms' | 'privacy' | 'refunds' | 'contact'

export const LEGAL_PAGES: { id: LegalPageId; title: string }[] = [
  { id: 'terms', title: 'Terms & Conditions' },
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'refunds', title: 'Refund & Cancellation Policy' },
  { id: 'contact', title: 'Contact us' },
]
