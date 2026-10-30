import { useMemo } from 'react'
import { QuestionNotFound, useQuestions } from '@/features/questions'
import { bestTakeIds, fillersTrend, questionProgress } from '@/features/progress'
import type { QuestionProgress } from '@/features/progress'
import { takeStats, useAllTakes } from '@/features/takes'
import { PATHS, practicePath } from '@/shared/config/paths'
import { ButtonLink, EmptyState, LineChart, List, Panel, Skeleton, Stat } from '@/shared/ui'
import LoadErrorBanner from '@/shared/ui/LoadErrorBanner'
import { shortDay, whenLabel } from '../model/format'
import TakeRow from './TakeRow'
import './history.css'

const rate = (value: number | null) => (value === null ? '—' : value.toFixed(1))

/** One question's progress: first, latest and best take, the trend, and every take (app-history.html "One question"). */
export default function QuestionProgressScreen({ questionId, now = new Date() }: { questionId: string; now?: Date }) {
  const questions = useQuestions()
  const takes = useAllTakes({ questionId })
  const best = useMemo(() => bestTakeIds(takes.data ?? []), [takes.data])
  const question = questions.data?.find((q) => q.id === questionId)

  if (questions.isSuccess && !question) return <QuestionNotFound />
  const progress = takes.data ? questionProgress(takes.data) : null

  return (
    <div className="history">
      <div className="history__head">
        <div className="history__title">
          <ButtonLink to={PATHS.history} variant="ghost" size="sm" icon="arrow-left" className="history__back">
            All takes
          </ButtonLink>
          <h1>{question?.text ?? <Skeleton width="60%" height={28} />}</h1>
          <p className="muted">
            {progress ? `${progress.count === 1 ? '1 take' : `${progress.count} takes`} since ${shortDay(progress.firstAt)}` : ' '}
          </p>
        </div>
        <ButtonLink to={practicePath(questionId)} variant="primary">
          Practise again
        </ButtonLink>
      </div>

      {takes.isError && <LoadErrorBanner error={takes.error} title="Couldn't load your takes" onRetry={() => void takes.refetch()} />}
      {takes.isSuccess && !progress && (
        <EmptyState
          icon="history"
          title="No takes for this question yet"
          actions={
            <ButtonLink to={practicePath(questionId)} variant="primary">
              Practise it
            </ButtonLink>
          }
        >
          Transcribe an answer and your progress shows up here.
        </EmptyState>
      )}

      {progress && takes.data && (
        <>
          <Stats progress={progress} />
          {progress.count > 1 && (
            <Panel title="Fillers per minute, take by take">
              <LineChart
                points={fillersTrend(takes.data, (take) => whenLabel(take, now))}
                description={trendDescription(progress)}
              />
            </Panel>
          )}
          <List as="div" aria-label="Takes">
            {takes.data.map((take) => (
              <TakeRow key={take.id} take={take} title={whenLabel(take, now)} meta={takeStats(take)} best={best.has(take.id)} />
            ))}
          </List>
        </>
      )}
    </div>
  )
}

function Stats({ progress }: { progress: QuestionProgress }) {
  const { change } = progress
  const changeNote =
    change === null ? 'fillers / min' : change === 0 ? 'same as first' : `${change < 0 ? '↓' : '↑'} ${Math.round(Math.abs(change) * 100)}% since first`
  return (
    <div className="history-stats">
      <Stat label="First take" value={rate(progress.first)} note="fillers / min" />
      <Stat label="Latest" value={rate(progress.latest)} note={changeNote} trend={change === null || change === 0 ? 'neutral' : change < 0 ? 'better' : 'worse'} />
      <Stat label="Best" value={rate(progress.best?.value ?? null)} note={progress.best ? shortDay(progress.best.at) : undefined} />
      <Stat label="Average pace" value={progress.averagePace ?? '—'} unit={progress.averagePace === null ? undefined : 'wpm'} />
    </div>
  )
}

function trendDescription(progress: QuestionProgress): string {
  if (progress.first === null || progress.latest === null) return 'Fillers per minute for each take.'
  return `Fillers per minute across ${progress.count} takes, from ${rate(progress.first)} on the first to ${rate(progress.latest)} on the latest.`
}
