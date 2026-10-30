import type { FaqItem } from '@/content/marketing'
import './marketing.css'

/** Questions and answers as native <details>: keyboard and screen-reader friendly, no script. */
export default function Faq({ items, openFirst = true }: { items: readonly FaqItem[]; openFirst?: boolean }) {
  return (
    <div className="mk-faq">
      {items.map((item, i) => (
        <details key={item.question} open={openFirst && i === 0}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}
