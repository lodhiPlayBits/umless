import { useEffect, useState } from 'react'
import NotFound from '../NotFound'
import { isServerUp, loadPracticeQuestion } from './practiceApi'
import type { PracticeQuestion } from './practiceApi'
import PracticeSession from './PracticeSession'

type Load = { status: 'loading' } | { status: 'missing' } | { status: 'error' } | { status: 'ready'; practice: PracticeQuestion }

/** /practice/:questionId — finds the question in the list (E16: unknown or deleted → not-found). */
export default function PracticeRoute({ questionId }: { questionId: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoad({ status: 'loading' })
    loadPracticeQuestion(questionId).then(
      (practice) => !cancelled && setLoad(practice ? { status: 'ready', practice } : { status: 'missing' }),
      () => !cancelled && setLoad({ status: 'error' }),
    )
    void isServerUp().then((up) => !cancelled && setServerUp(up))
    return () => {
      cancelled = true
    }
  }, [questionId, attempt])

  if (load.status === 'loading') return <p className="muted" role="status">Loading…</p>
  if (load.status === 'missing') return <NotFound />
  if (load.status === 'error') {
    return (
      <div className="banner error" role="alert">
        <span aria-hidden="true">⚠</span>
        <div>
          <strong>Can't reach the umless server</strong>
          <span className="small">
            Start the backend with <code>python run.py</code> in the <code>backend</code> folder, then retry.
          </span>
          <div className="actions">
            <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }
  return <PracticeSession practice={load.practice} serverUp={serverUp} />
}
