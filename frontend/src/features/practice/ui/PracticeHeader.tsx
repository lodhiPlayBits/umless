import { practicePath } from '@/shared/config/paths'
import { Badge, Link } from '@/shared/ui'

type PracticeHeaderProps = {
  question: string
  number: number
  total: number
  nextId: string | null
  /** Ready and result show where you are in the list; the other stages keep only the question. */
  showPosition: boolean
  showNext: boolean
}

/** "Question 2 of 6", the next-question link and the question itself. */
export default function PracticeHeader({ question, number, total, nextId, showPosition, showNext }: PracticeHeaderProps) {
  return (
    <div className="practice-head">
      {showPosition && (
        <div className="practice-head__row">
          <Badge>
            Question {number} of {total}
          </Badge>
          {showNext && nextId && (
            <Link to={practicePath(nextId)} className="practice-head__next">
              Next question →
            </Link>
          )}
        </div>
      )}
      <h1 className="practice-question">{question}</h1>
    </div>
  )
}
