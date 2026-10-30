import { FAQ, FEATURES, STEPS, WORKS_ANYWHERE } from '@/content/marketing'
import { CtaBand, Faq, FeatureGrid, Hero, PracticeLoop, PricingCards, PrivacyPanel, Section } from '@/features/marketing'
import { PATHS } from '@/shared/config/paths'
import { Link } from '@/shared/ui'

/**
 * The public landing page (docs/design/v2/landing.html). The design's testimonials section stays
 * out until there are real quotes (docs/roadmap/2026-10-28-ui-redesign.md decision 6).
 */
export default function LandingPage() {
  return (
    <>
      <Hero />
      <Section id="how" alt eyebrow="How it works" title="Three steps, about two minutes">
        <FeatureGrid items={STEPS} numbered />
      </Section>
      <Section
        id="features"
        eyebrow="Features"
        title="Everything you need to hear yourself clearly"
        lead="Most transcription tools clean up your speech. umless keeps the messy parts, because that's what you're here to fix."
      >
        <FeatureGrid items={FEATURES} />
      </Section>
      <Section alt eyebrow="The whole practice loop" title="Before, while, and after you answer">
        <PracticeLoop />
      </Section>
      <PrivacyPanel />
      <Section id="pricing" alt eyebrow="Pricing" title="Start free. Pay only for the time you practise.">
        <PricingCards />
        <p className="mk-note mk-below">
          <Link to={PATHS.pricing}>Compare everything that's included</Link>
        </p>
      </Section>
      <Section eyebrow="Works anywhere" title="Nothing to install">
        <FeatureGrid items={WORKS_ANYWHERE} />
      </Section>
      <Section id="faq" alt eyebrow="FAQ" title="Questions, answered">
        <Faq items={FAQ} />
      </Section>
      <div className="mk-spacer" />
      <CtaBand title="Your next answer, minus the ums" lead="Two minutes from now you could hear exactly how you sound." />
    </>
  )
}
