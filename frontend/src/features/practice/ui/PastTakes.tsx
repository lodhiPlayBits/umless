import { useMemo, useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { Banner, Button, Icon, IconButton, buttonClass } from '@/shared/ui'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { baseFileName } from '@/shared/lib/filenames'
import { useObjectUrl } from '@/shared/lib/useObjectUrl'
import { transcriptFile } from '../model/summaryText'
import { takesApi as realTakesApi } from '../api/takesApi'
import type { Take, TakeSummary, TakesApi } from '../api/takesApi'
import { takeDate, takeStats } from '../model/takesText'
import TranscriptCard from './TranscriptCard'
import { removeCachedTake, useQuestionTakes } from '../model/useTakes'

type Opened = { id: string; take: Take | null; failed: boolean }

interface PastTakesProps {
  questionId: string
  /** For the downloaded file's name and first line. */
  question: string
  api?: TakesApi
}

/** The question's saved takes, newest first: open one to read it, or delete it. */
export default function PastTakes({ questionId, question, api = realTakesApi }: PastTakesProps) {
  const query = useQuestionTakes(questionId, api)
  const load = query.isSuccess ? { status: 'ready' as const, takes: query.data } : { status: query.isError && !query.isFetching ? ('error' as const) : ('loading' as const) }
  const [opened, setOpened] = useState<Opened | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<TakeSummary | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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
    removeCachedTake(questionId, take.id)
    if (opened?.id === take.id) setOpened(null)
  }

  return (
    <section className="past-takes" aria-labelledby="past-takes-heading">
      <h2 id="past-takes-heading">Past takes</h2>
      {load.status === 'loading' && (
        <p className="muted" role="status">
          Loading your past takes…
        </p>
      )}
      {load.status === 'error' && (
        <Banner
          tone="warning"
          title="Couldn't load your past takes."
          actions={
            <Button size="sm" icon="refresh" onClick={() => void query.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {load.status === 'ready' && load.takes.length === 0 && (
        <p className="muted">No saved takes yet. Every transcript you make for this question is saved here.</p>
      )}
      {deleteError && (
        <Banner tone="danger" title={deleteError} />
      )}
      {load.status === 'ready' && load.takes.length > 0 && (
        <ul className="ui-list">
          {load.takes.map((take) => (
            <li key={take.id}>
              <div className="ui-row">
                <div className="ui-row__text">
                  <strong className="ui-row__title">{takeDate(take)}</strong>
                  <span className="ui-row__meta">{takeStats(take)}</span>
                </div>
                <div className="ui-row__end">
                  <Button variant="ghost" size="sm" aria-expanded={opened?.id === take.id} onClick={() => toggle(take.id)}>
                    {opened?.id === take.id ? 'Hide' : 'Show'} transcript
                  </Button>
                  <IconButton icon="trash" label={`Delete take from ${takeDate(take)}`} onClick={() => setConfirmDelete(take)} />
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
      <div className="take-body">
        <Banner tone="danger" title="Couldn't open this take. Try again in a moment." />
      </div>
    )
  }
  if (!take) {
    return (
      <p className="take-body muted" role="status">
        Opening…
      </p>
    )
  }
  return (
    <div className="take-body">
      {take.transcript.words.length === 0 ? (
        <p className="muted">No words were heard in this take.</p>
      ) : (
        <TranscriptCard transcript={take.transcript} />
      )}
      {fileUrl && (
        <a className={buttonClass({ size: 'sm' })} href={fileUrl} download={`${baseFileName(question, new Date(take.created_at))}.txt`}>
          <Icon name="download" />
          Download transcript (.txt)
        </a>
      )}
    </div>
  )
}
