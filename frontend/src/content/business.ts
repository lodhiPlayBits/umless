/** Who runs umless, as published on the legal pages. Must match the Razorpay KYC details. */
export const BUSINESS = {
  name: 'Gaurav Lodhi',
  email: 'gauravlodhi983@gmail.com',
  phone: '+91 8595 007855',
  /** Postal address; shown on the Contact page once set. */
  address: null as string | null,
  site: 'https://umless.in',
}

export const LAST_UPDATED = '28 October 2026'

/**
 * The prices, in words. The server's price list (backend/app/billing/packs.py) is what's
 * charged; keep this in step with it.
 */
/** Free transcriptions for every new account; the backend's FREE_TRANSCRIPTIONS (app/billing/packs.py). */
export const FREE_TRANSCRIPTIONS = 3

export const PRICING = {
  free: `${FREE_TRANSCRIPTIONS} free transcriptions for every new account`,
  packs: [
    { name: '1 session', time: '60 minutes of recording time', price: '₹40', minutes: 60, rupees: 40 },
    { name: '5 sessions', time: '300 minutes of recording time', price: '₹120', minutes: 300, rupees: 120 },
  ],
}

export type LegalPageId = 'terms' | 'privacy' | 'refunds' | 'contact'

export const LEGAL_PAGES: { id: LegalPageId; title: string }[] = [
  { id: 'terms', title: 'Terms & Conditions' },
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'refunds', title: 'Refund & Cancellation Policy' },
  { id: 'contact', title: 'Contact us' },
]
