import { FREE_TRANSCRIPTIONS } from '@/content/business'
import { PRICING_FAQ } from '@/content/marketing'
import { CompareTable, CtaBand, Faq, PricingCards, Section } from '@/features/marketing'

/** The pricing page (docs/design/v2/pricing.html) with the live packs instead of the design's example plans. */
export default function PricingPage() {
  return (
    <>
      <div className="mk-container mk-page-head">
        <h1 className="mk-display">Simple pricing. Start free.</h1>
        <p className="mk-lead">{FREE_TRANSCRIPTIONS} free transcriptions on us. After that, buy practice time in packs: no subscription, and it never expires.</p>
      </div>
      <div className="mk-container">
        <PricingCards />
      </div>
      <Section title="Compare">
        <CompareTable />
      </Section>
      <Section alt title="Billing questions">
        <Faq items={PRICING_FAQ} />
      </Section>
      <div className="mk-spacer" />
      <CtaBand title="Try it on your next question" lead="Free, no card needed." />
    </>
  )
}
