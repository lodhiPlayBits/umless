import { useEffect, useState } from 'react'
import LoadErrorBanner from '../components/LoadErrorBanner'
import NotFound from '../NotFound'
import { isServerUp, loadPracticeQuestion } from './practiceApi'
import type { PracticeQuestion } from './practiceApi'
import PracticeSession from './PracticeSession'

/** The same limit as the questions list (docs/design/flows.md F1). */
const LOAD_TIMEOUT_MS = 10_000

type Load =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; practice: PracticeQuestion }

/** /practice/:questionId — finds the question in the list (E16: unknown or deleted → not-found). */
export default function PracticeRoute({ questionId }: { questionId: string }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [serverUp, setServerUp] = useState<boolean | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Leaving the page or pressing Retry aborts this attempt's requests, and so does the timeout,
    // so a hung backend ends in the error banner and "Server offline" instead of "Loading…" forever.
    const controller = new AbortController()
    // Not cleared when the requests finish: aborting a settled request is a no-op, and the limit then
    // covers whichever of the two is still pending.
    const timeout = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS)
    let current = true
    setLoad({ status: 'loading' })
    loadPracticeQuestion(questionId, controller.signal).then(
      (practice) => current && setLoad(practice ? { status: 'ready', practice } : { status: 'missing' }),
      (error: unknown) => current && setLoad({ status: 'error', error }),
    )
    void isServerUp(controller.signal).then((up) => current && setServerUp(up))
    return () => {
      current = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [questionId, attempt])

  if (load.status === 'loading') return <p className="muted" role="status">Loading…</p>
  if (load.status === 'missing') return <NotFound />
  if (load.status === 'error') {
    return <LoadErrorBanner error={load.error} title="Couldn't load this question" onRetry={() => setAttempt((n) => n + 1)} />
  }
  return <PracticeSession practice={load.practice} serverUp={serverUp} />
}
