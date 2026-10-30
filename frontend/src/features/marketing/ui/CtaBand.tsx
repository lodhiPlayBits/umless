import type { ReactNode } from 'react'
import { PATHS } from '@/shared/config/paths'
import { ButtonLink } from '@/shared/ui'
import './marketing.css'

/** The closing call to action of a page. */
export default function CtaBand({ title, lead }: { title: ReactNode; lead: ReactNode }) {
  return (
    <section className="mk-band mk-band--tight" aria-label="Get started">
      <div className="mk-container">
        <div className="mk-cta">
          <h2 className="mk-h2">{title}</h2>
          <p className="mk-lead">{lead}</p>
          <ButtonLink to={PATHS.signUp} variant="primary" size="lg" icon="arrow">
            Start practising free
          </ButtonLink>
        </div>
      </div>
    </section>
  )
}
