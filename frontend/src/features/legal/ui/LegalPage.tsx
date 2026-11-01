import type { ReactNode } from 'react'
import './LegalPage.css'
import { BUSINESS, LAST_UPDATED, LEGAL_PAGES, PRICING } from '@/content/business'
import type { LegalPageId } from '@/content/business'

const email = <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>

function Pricing() {
  return (
    <ul>
      <li>{PRICING.free}, counted by the second.</li>
      {PRICING.packs.map((pack) => (
        <li key={pack.name}>
          {pack.name}: {pack.time} for {pack.price} (inclusive of all charges).
        </li>
      ))}
    </ul>
  )
}

const PAGES: Record<LegalPageId, ReactNode> = {
  terms: (
    <>
      <p>
        These terms apply to umless ({BUSINESS.site}), a speech-practice service operated by {BUSINESS.name}, India
        ("we", "us"). By creating an account or buying practice time you agree to them.
      </p>
      <h2>The service</h2>
      <p>
        umless lets you record spoken answers to your own practice questions and returns a transcript that keeps filler
        words ("um", "uh") and marks long pauses, with a summary of your pace and fillers. Transcripts are produced
        automatically and may contain mistakes; umless gives no coaching, grading or professional advice.
      </p>
      <h2>Your account</h2>
      <p>
        You need an account to use umless. Keep your sign-in details safe; you are responsible for what happens under
        your account. You must be at least 18, or use umless with a parent's or guardian's permission.
      </p>
      <h2>Prices and payment</h2>
      <Pricing />
      <p>
        Each transcription deducts exactly the length of the recording, by the second: your free minutes first, then
        your purchased practice time. A recording can be up to 10 minutes long. Recordings in which no words are heard
        are not charged. Purchased time does
        not expire. Payments are processed by Razorpay; we never see or store your card, UPI or bank details. Prices
        are in Indian Rupees and may change; a change never affects time you have already bought.
      </p>
      <h2>Acceptable use</h2>
      <p>
        Don't use umless to record other people without their consent, to upload unlawful content, or to disrupt,
        overload or reverse-engineer the service. We may suspend accounts that do.
      </p>
      <h2>Your content</h2>
      <p>
        Your questions and transcripts belong to you. You let us store and process them only to run the service for you
        (see the Privacy Policy). You can delete any question or saved take in the app at any time.
      </p>
      <h2>Availability and liability</h2>
      <p>
        We work to keep umless available but don't guarantee it will be uninterrupted or error-free. To the extent the
        law allows, our total liability to you is limited to the amount you paid us in the 3 months before the claim.
      </p>
      <h2>Ending your account</h2>
      <p>
        You can stop using umless at any time and ask us to delete your account by writing to {email}. Refunds follow
        the Refund & Cancellation Policy.
      </p>
      <h2>Law and disputes</h2>
      <p>These terms are governed by the laws of India. Write to {email} first; we aim to resolve issues within 7 days.</p>
    </>
  ),
  privacy: (
    <>
      <p>
        This policy explains what umless ({BUSINESS.site}), operated by {BUSINESS.name}, collects and why. We follow
        India's Digital Personal Data Protection Act, 2023.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your name and email address (and profile picture, if you sign in with Google or
          another provider), handled by our sign-in provider, Clerk.
        </li>
        <li>
          <strong>Your questions and transcripts:</strong> the questions you write, and the transcript and summary of
          each answer you transcribe (your "past takes").
        </li>
        <li>
          <strong>Payments:</strong> which pack you bought, the amount, and Razorpay's order and payment ids. Your card,
          UPI or bank details go only to Razorpay.
        </li>
        <li>
          <strong>Payments and refunds:</strong> refunds you request, with Razorpay's refund id.
        </li>
        <li>
          <strong>Technical data:</strong> standard server logs (IP address, browser, time of request) and, for each
          transcription, your account id, its length and word count (never the words themselves), kept for security,
          abuse prevention and troubleshooting. To stop abuse we also count transcriptions per account for one hour.
        </li>
      </ul>
      <h2>Your recordings</h2>
      <p>
        Your audio stays in your browser until you choose Transcribe. It is then sent to our speech-to-text provider,
        Deepgram, only to produce the transcript, with Deepgram's model-improvement program switched off, so it is not
        used for training. We never store your audio on our servers; download it if you want to keep it.
      </p>
      <h2>Why we use it</h2>
      <p>
        Only to provide umless to you: to sign you in, keep your questions and past takes, transcribe your answers,
        count your practice time and take payments. We don't sell your data or use it for advertising.
      </p>
      <h2>Who processes it for us</h2>
      <ul>
        <li>Clerk (sign-in and accounts)</li>
        <li>Deepgram (transcription)</li>
        <li>Oracle Cloud Infrastructure, Mumbai region (our servers, database, file storage and backups)</li>
        <li>Razorpay (payments and refunds)</li>
      </ul>
      <p>
        Clerk and Deepgram may process your data outside India, under their own security and privacy commitments. Each
        receives only what it needs for its part of the service.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Questions and transcripts are kept until you delete them or your account. We back up our database every night
        and keep each backup for 30 days, so something you delete is gone from our backups within 30 days. Server logs
        are kept for a few weeks at most. Payment and refund records are kept as long as Indian tax and accounting law
        requires.
      </p>
      <h2>Your rights</h2>
      <p>
        You can see, correct and delete your questions and transcripts in the app. To get a copy of your data, have your
        account deleted, or raise a grievance, write to our Grievance Officer, {BUSINESS.name}, at {email}. We reply
        within 7 days.
      </p>
      <h2>Cookies</h2>
      <p>We use only the cookies needed to keep you signed in. No advertising or tracking cookies.</p>
    </>
  ),
  refunds: (
    <>
      <h2>Refunds</h2>
      <ul>
        <li>
          You can get a full refund for a pack within <strong>3 days</strong> of buying it, as long as you haven't used
          any paid practice time since you bought it.
        </li>
        <li>
          Once you use any of it, the pack can't be refunded. That includes the 5-session pack: if you use even one
          session (or part of one), none of it can be refunded.
        </li>
        <li>Your free minutes don't count: using them doesn't affect a refund.</li>
        <li>
          If you were charged but didn't get your practice time, or were charged twice, we refund the extra payment in
          full, whenever you tell us.
        </li>
      </ul>
      <h2>How to ask</h2>
      <p>
        Go to Settings → Billing → Purchases and press <strong>Request refund</strong> next to the purchase. The button
        is there only while the purchase qualifies. For anything else, write to {email} from the email address of your
        umless account, with the date of purchase and, if you have it, the Razorpay payment id. We reply within 2
        working days.
      </p>
      <h2>When the money arrives</h2>
      <p>
        The pack's practice time is removed from your account as soon as you request the refund. Razorpay sends the
        money back to your original payment method within 5–7 working days; your bank may take a few more days to show
        it.
      </p>
      <h2>Cancellation</h2>
      <p>
        umless has no subscriptions, so there is nothing to cancel: you pay only when you buy a pack, and purchased time
        never expires. You can stop using umless at any time.
      </p>
    </>
  ),
  contact: (
    <>
      <p>umless is operated by {BUSINESS.name}, India.</p>
      <ul>
        <li>Email: {email}</li>
        <li>
          Phone: <a href={`tel:${BUSINESS.phone.replace(/\s/g, '')}`}>{BUSINESS.phone}</a>
        </li>
        {BUSINESS.address && <li>Address: {BUSINESS.address}</li>}
      </ul>
      <p>
        We reply to emails within 2 working days, Monday to Saturday. For complaints and suggestions you can also use the
        form below.
      </p>
      <h2>Pricing</h2>
      <Pricing />
    </>
  ),
}

export default function LegalPage({ page }: { page: LegalPageId }) {
  const title = LEGAL_PAGES.find((p) => p.id === page)!.title
  return (
    <article className="legal">
      <h1>{title}</h1>
      <p className="muted small">Last updated {LAST_UPDATED}</p>
      {PAGES[page]}
    </article>
  )
}
