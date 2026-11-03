/** Who runs umless, as published on the legal pages. Must match the Razorpay KYC details. */
export const BUSINESS = {
  name: 'Gaurav Lodhi',
  email: 'gauravlodhi983@gmail.com',
  phone: '+91 8595 007855',
  /** Postal address; shown on the Contact page once set. */
  address: null as string | null,
  site: 'https://umless.in',
}

export const LAST_UPDATED = '3 November 2026'

/**
 * The launch offer (owner's decision, 2026-11-03): 60 free minutes and 40% off both packs, until
 * the owner ends it by hand. To end it: set this to false here AND LAUNCH_OFFER in
 * backend/app/billing/packs.py, then deploy.
 */
export const LAUNCH_OFFER = true
export const OFFER_LABEL = 'Launch offer · 40% off'

/**
 * The prices, in words. The server's price list (backend/app/billing/packs.py) is what's
 * charged; keep this in step with it.
 */
/** Free practice time for every new account, in minutes; the backend's FREE_SECONDS / 60 (app/billing/packs.py). */
export const FREE_MINUTES = LAUNCH_OFFER ? 60 : 20

/** The pack ids are the backend's (app/billing/packs.py). */
const PACKS: { id: 'session_1' | 'session_5'; name: string; time: string; minutes: number; normalRupees: number; offerRupees: number }[] = [
  { id: 'session_1', name: '1 session', time: '60 minutes of recording time', minutes: 60, normalRupees: 49, offerRupees: 29 },
  { id: 'session_5', name: '5 sessions', time: '300 minutes of recording time', minutes: 300, normalRupees: 199, offerRupees: 119 },
]

export const PRICING = {
  free: `${FREE_MINUTES} minutes of free practice time for every new account`,
  packs: PACKS.map((pack) => {
    const rupees = LAUNCH_OFFER ? pack.offerRupees : pack.normalRupees
    return {
      id: pack.id,
      name: pack.name,
      time: pack.time,
      price: `₹${rupees}`,
      minutes: pack.minutes,
      rupees,
      /** The normal price, shown crossed out during the launch offer; null otherwise. */
      wasPrice: LAUNCH_OFFER ? `₹${pack.normalRupees}` : null,
    }
  }),
}

export type LegalPageId = 'terms' | 'privacy' | 'refunds' | 'contact'

export const LEGAL_PAGES: { id: LegalPageId; title: string }[] = [
  { id: 'terms', title: 'Terms & Conditions' },
  { id: 'privacy', title: 'Privacy Policy' },
  { id: 'refunds', title: 'Refund & Cancellation Policy' },
  { id: 'contact', title: 'Contact us' },
]
