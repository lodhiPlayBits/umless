import { HERO, SAMPLE_TRANSCRIPT } from '@/content/marketing'
import { PATHS } from '@/shared/config/paths'
import { Badge, ButtonLink } from '@/shared/ui'
import SampleTranscript from './SampleTranscript'
import './marketing.css'

/** The landing hero: the promise, the two calls to action, and a result screen as the product shot. */
export default function Hero() {
  return (
    <section className="mk-hero" aria-labelledby="hero-title">
      <div className="mk-container mk-hero__grid">
        <div className="mk-hero__copy">
          <Badge tone="primary">{HERO.badge}</Badge>
          <h1 id="hero-title" className="mk-display">
            Say less <mark className="filler">um</mark>.
          </h1>
          <p className="mk-lead">{HERO.lead}</p>
          <div className="mk-actions">
            <ButtonLink to={PATHS.signUp} variant="primary" size="lg" icon="arrow">
              Start practising free
            </ButtonLink>
            <ButtonLink to="/#how" size="lg">
              See how it works
            </ButtonLink>
          </div>
          <p className="mk-note">{HERO.note}</p>
        </div>
        <figure className="mk-mock" aria-label="Example result screen">
          <div className="mk-mock__bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <Badge tone="success">Result · 1:42</Badge>
          </div>
          <div className="mk-mock__body">
            <p className="mk-mock__q">
              <span>Question 2 of 5</span>
              <strong>{HERO.mockQuestion}</strong>
            </p>
            <SampleTranscript text={SAMPLE_TRANSCRIPT} className="mk-mock__transcript" />
            <div className="mk-mock__summary">
              {HERO.mockSummary.map((item) => (
                <Badge key={item}>{item}</Badge>
              ))}
            </div>
          </div>
        </figure>
      </div>
    </section>
  )
}
