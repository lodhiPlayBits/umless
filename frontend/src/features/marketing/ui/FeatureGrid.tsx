import type { FeatureItem } from '@/content/marketing'
import { Card, IconTile } from '@/shared/ui'
import './marketing.css'

/** Cards in a responsive grid: with icons, or numbered for steps. */
export default function FeatureGrid({ items, numbered = false }: { items: readonly FeatureItem[]; numbered?: boolean }) {
  return (
    <ul className="mk-grid mk-grid--3">
      {items.map((item, i) => (
        <li key={item.title}>
          <Card className="mk-card">
            {numbered ? (
              <span className="mk-step" aria-hidden="true">
                {i + 1}
              </span>
            ) : (
              <IconTile icon={item.icon} />
            )}
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </Card>
        </li>
      ))}
    </ul>
  )
}
