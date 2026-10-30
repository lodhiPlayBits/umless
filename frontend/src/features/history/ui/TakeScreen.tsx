import { useMemo, useState } from 'react'
import { useQuestions } from '@/features/questions'
import { invalidateTakes, removeCachedTake, summaryRows, takesApi, TranscriptCard, transcriptFile, useTake } from '@/features/takes'
import type { TakesApi } from '@/features/takes'
import { ApiError } from '@/shared/api/client'
import { PATHS, questionHistoryPath } from '@/shared/config/paths'
import { baseFileName } from '@/shared/lib/filenames'
import { navigate } from '@/shared/lib/router'
import { useObjectUrl } from '@/shared/lib/useObjectUrl'
import { Banner, Button, ButtonLink, EmptyState, Icon, Skeleton, Stat, buttonClass } from '@/shared/ui'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import LoadErrorBanner from '@/shared/ui/LoadErrorBanner'
import './history.css'

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })

/** One saved take: its summary, transcript, download and delete. */
export default function TakeScreen({ takeId, api = takesApi }: { takeId: string; api?: TakesApi }) {
  const query = useTake(takeId, api)
  const questions = useQuestions()
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const take = query.data
  const question = questions.data?.find((q) => q.id === take?.question_id)?.text ?? ''
  const recordedMs = (take?.duration_seconds ?? 0) * 1000

  const fileBlob = useMemo(
    () => (take ? new Blob([transcriptFile(question, take.transcript, recordedMs)], { type: 'text/plain;charset=utf-8' }) : null),
    [question, take, recordedMs],
  )
  const fileUrl = useObjectUrl(fileBlob)

  if (query.isError && query.error instanceof ApiError && query.error.code === 'take_not_found') {
    return (
      <EmptyState
        bare
        headingLevel={1}
        icon="history"
        title="That take doesn't exist any more"
        actions={
          <ButtonLink to={PATHS.history} variant="primary">
            Back to history
          </ButtonLink>
        }
      >
        It may have been deleted, maybe in another tab.
      </EmptyState>
    )
  }
  if (query.isError) return <LoadErrorBanner error={query.error} title="Couldn't open this take" onRetry={() => void query.refetch()} />
  if (!take) return <Skeleton width="60%" height={28} />

  async function remove() {
    setConfirming(false)
    setDeleteError(null)
    try {
      await api.remove(takeId)
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'take_not_found')) {
        setDeleteError("Couldn't delete this take. Try again.")
        return
      }
    }
    removeCachedTake(takeId)
    void invalidateTakes()
    navigate(questionHistoryPath(take!.question_id))
  }

  return (
    <div className="history">
      <div className="history__head">
        <div className="history__title">
          <ButtonLink to={questionHistoryPath(take.question_id)} variant="ghost" size="sm" icon="arrow-left" className="history__back">
            This question's progress
          </ButtonLink>
          <h1>{question || <Skeleton width="60%" height={28} />}</h1>
          <p className="history-take__meta">{dateTime.format(new Date(take.created_at))}</p>
        </div>
      </div>

      {deleteError && <Banner tone="danger" title={deleteError} />}

      <div className="history-stats history-stats--compact">
        {summaryRows(take.transcript, recordedMs).map((row) => (
          <Stat key={row.label} label={row.label} value={row.value} />
        ))}
      </div>

      {take.transcript.words.length === 0 ? (
        <EmptyState icon="mic" title="No words were heard in this take" />
      ) : (
        <TranscriptCard transcript={take.transcript} />
      )}

      <div className="history-take__actions">
        {fileUrl && (
          <a className={buttonClass({ size: 'sm' })} href={fileUrl} download={`${baseFileName(question || 'take', new Date(take.created_at))}.txt`}>
            <Icon name="download" />
            Download transcript (.txt)
          </a>
        )}
        <Button variant="danger" size="sm" icon="trash" onClick={() => setConfirming(true)}>
          Delete take
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog title="Delete this take?" confirmLabel="Delete" danger onCancel={() => setConfirming(false)} onConfirm={() => void remove()}>
          <p>The transcript from {dateTime.format(new Date(take.created_at))} is deleted for good.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
