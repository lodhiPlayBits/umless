import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../client'
import ConfirmDialog from '../components/ConfirmDialog'
import { baseFileName } from '../filenames'
import { useObjectUrl } from '../useObjectUrl'
import { transcriptFile } from './summaryText'
import { takesApi as realTakesApi } from './takesApi'
import type { Take, TakeSummary, TakesApi } from './takesApi'
import { takeDate, takeStats } from './takesText'
import TranscriptCard from './TranscriptCard'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; takes: TakeSummary[] }
type Opened = { id: string; take: Take | null; failed: boolean }

interface PastTakesProps {
  questionId: string
  /** For the downloaded file's name and first line. */
  question: string
  api?: TakesApi
}

/** The question's saved takes, newest first: open one to read it, or delete it. */
export default function PastTakes({ questionId, question, api = realTakesApi }: PastTakesProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [opened, setOpened] = useState<Opened | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TakeSummary | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let current = true
    setLoad({ status: 'loading' })
    api.list(questionId, controller.signal).then(
      (takes) => current && setLoad({ status: 'ready', takes }),
      () => current && setLoad({ status: 'error' }),
    )
    return () => {
      current = false
      controller.abort()
    }
  }, [api, questionId, attempt])

  function toggle(id: string) {
    if (opened?.id === id) {
      setOpened(null)
      return
    }
    setOpened({ id, take: null, failed: false })
    api.get(id).then(
      (take) => setOpened((o) => (o?.id === id ? { id, take, failed: false } : o)),
      () => setOpened((o) => (o?.id === id ? { id, take: null, failed: true } : o)),
    )
  }

  async function remove(take: TakeSummary) {
    setConfirmDelete(null)
    setDeleteError(null)
    try {
      await api.remove(take.id)
    } catch (error) {
      // Already gone counts as deleted.
      if (!(error instanceof ApiError && error.code === 'take_not_found')) {
        setDeleteError("Couldn't delete that take. Try again.")
        return
      }
    }
    setLoad((l) => (l.status === 'ready' ? { status: 'ready', takes: l.takes.filter((t) => t.id !== take.id) } : l))
    if (opened?.id === take.id) setOpened(null)
  }

  return (
    <section className="past-takes" aria-labelledby="past-takes-heading">
      <h2 id="past-takes-heading">Past takes</h2>
      {load.status === 'loading' && (
        <p className="muted small" role="status">
          Loading your past takes…
        </p>
      )}
      {load.status === 'error' && (
        <p className="muted small">
          Couldn't load your past takes.{' '}
          <button type="button" className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
      {load.status === 'ready' && load.takes.length === 0 && (
        <p className="muted small">No saved takes yet. Every transcript you make for this question is saved here.</p>
      )}
      {deleteError && (
        <p className="field-msg error" role="alert">
          {deleteError}
        </p>
      )}
      {load.status === 'ready' && load.takes.length > 0 && (
        <ul className="take-list">
          {load.takes.map((take) => (
            <li key={take.id} className="take-row">
              <div className="take-head">
                <div>
                  <strong>{takeDate(take)}</strong>
                  <div className="muted small">{takeStats(take)}</div>
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-expanded={opened?.id === take.id}
                    onClick={() => toggle(take.id)}
                  >
                    {opened?.id === take.id ? 'Hide' : 'Show'} transcript
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost icon-btn"
                    aria-label={`Delete take from ${takeDate(take)}`}
                    onClick={() => setConfirmDelete(take)}
                  >
                    🗑
                  </button>
                </div>
              </div>
              {opened?.id === take.id && <OpenedTake opened={opened} question={question} />}
            </li>
          ))}
        </ul>
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this take?"
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void remove(confirmDelete)}
        >
          <p>The transcript from {takeDate(confirmDelete)} is deleted for good.</p>
        </ConfirmDialog>
      )}
    </section>
  )
}

function OpenedTake({ opened, question }: { opened: Opened; question: string }) {
  const { take } = opened
  const fileBlob = useMemo(
    () =>
      take
        ? new Blob([transcriptFile(question, take.transcript, (take.duration_seconds ?? 0) * 1000)], {
            type: 'text/plain;charset=utf-8',
          })
        : null,
    [question, take],
  )
  const fileUrl = useObjectUrl(fileBlob)

  if (opened.failed) {
    return (
      <p className="field-msg error" role="alert">
        Couldn't open this take. Try again in a moment.
      </p>
    )
  }
  if (!take) {
    return (
      <p className="muted small" role="status">
        Opening…
      </p>
    )
  }
  return (
    <div className="take-body">
      {take.transcript.words.length === 0 ? (
        <p className="muted small">No words were heard in this take.</p>
      ) : (
        <TranscriptCard transcript={take.transcript} />
      )}
      {fileUrl && (
        <a className="btn" href={fileUrl} download={`${baseFileName(question, new Date(take.created_at))}.txt`}>
          ⬇ Download transcript (.txt)
        </a>
      )}
    </div>
  )
}
