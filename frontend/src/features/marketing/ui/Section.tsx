import type { ReactNode } from 'react'
import { useId } from 'react'
import { cx } from '@/shared/ui'
import './marketing.css'

type SectionProps = {
  id?: string
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  /** The grey band between white sections. */
  alt?: boolean
  className?: string
  children?: ReactNode
}

/** One band of a marketing page: an eyebrow, a heading, a lead and its content, centred. */
export default function Section({ id, eyebrow, title, lead, alt = false, className, children }: SectionProps) {
  const headingId = useId()
  return (
    <section id={id} className={cx('mk-band', alt && 'mk-band--alt', className)} aria-labelledby={headingId}>
      <div className="mk-container">
        <div className="mk-head">
          {eyebrow && <span className="mk-eyebrow">{eyebrow}</span>}
          <h2 id={headingId} className="mk-h2">
            {title}
          </h2>
          {lead && <p className="mk-lead">{lead}</p>}
        </div>
        {children}
      </div>
    </section>
  )
}
