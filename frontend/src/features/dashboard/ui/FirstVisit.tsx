import type { Question } from '@/features/questions'
import { QuickAddQuestion } from '@/features/questions'
import { practicePath } from '@/shared/config/paths'
import { Badge, ButtonLink, Panel, Stat, cx } from '@/shared/ui'

/** Before the first take: three steps to a first result, and a preview of what it shows. */
export default function FirstVisit({ questions }: { questions: readonly Question[] }) {
  const steps = [
    { title: 'Add a question', detail: 'you expect to be asked', done: questions.length > 0 },
    { title: 'Record your answer', detail: "out loud, like it's real", done: false },
    { title: 'See your result', detail: 'fillers, pauses and pace', done: false },
  ]
  const done = steps.filter((step) => step.done).length
  const first = questions[0]

  return (
    <div className="dashboard">
      <div className="dashboard__head">
        <div>
          <h1>Welcome to umless</h1>
          <p className="muted">Three steps to your first result. It takes about two minutes.</p>
        </div>
      </div>
      <div className="dashboard__grid">
        <Panel title="Get started" actions={<Badge>{done} of 3 done</Badge>}>
          <ol className="dashboard__checklist">
            {steps.map((step, index) => (
              <li key={step.title} className={cx(step.done && 'is-done')}>
                <span className="dashboard__tick" aria-hidden="true">
                  {step.done ? '✓' : index + 1}
                </span>
                <span>
                  <strong>{step.title}</strong> <span className="muted">{step.detail}</span>
                  {step.done && <span className="ui-sr-only"> (done)</span>}
                </span>
              </li>
            ))}
          </ol>
          {first ? (
            <div>
              <ButtonLink to={practicePath(first.id)} variant="primary" size="lg" icon="mic">
                Record your first answer
              </ButtonLink>
            </div>
          ) : (
            <QuickAddQuestion />
          )}
        </Panel>
        <Panel title="What you'll see">
          <p className="dashboard__sample">
            So, <mark className="filler">um</mark>, I've been a developer for <span className="pause">··</span> five years.
          </p>
          <p className="muted">
            Fillers are highlighted, and each dot is one second of silence. Your stats and progress chart appear here after your
            first take.
          </p>
          <div className="dashboard__preview">
            <Stat label="Fillers per minute" value="—" />
            <Stat label="Average pace" value="—" />
          </div>
        </Panel>
      </div>
    </div>
  )
}
