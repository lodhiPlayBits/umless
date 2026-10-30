import { PRACTICE_LOOP } from '@/content/marketing'
import { Card } from '@/shared/ui'
import './marketing.css'

/** Before, while and after you answer: what the app does at each point. */
export default function PracticeLoop() {
  return (
    <ul className="mk-grid mk-grid--3">
      {PRACTICE_LOOP.map((phase) => (
        <li key={phase.title}>
          <Card className="mk-card">
            <h3>{phase.title}</h3>
            <ul className="mk-ticks">
              {phase.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ul>
  )
}
