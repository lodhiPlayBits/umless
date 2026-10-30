import { useMemo, useState } from 'react'
import { useQuestions } from '@/features/questions'
import { bestTakeIds, groupByDay, sinceDaysAgo } from '@/features/progress'
import { takeStats, useAllTakes } from '@/features/takes'
import { PATHS, questionHistoryPath } from '@/shared/config/paths'
import { ButtonLink, EmptyState, Field, Link, List, ListGroupLabel, Segmented, Select, Skeleton } from '@/shared/ui'
import LoadErrorBanner from '@/shared/ui/LoadErrorBanner'
import { whenLabel } from '../model/format'
import TakeRow from './TakeRow'
import './history.css'

type Period = '7' | '30' | 'all'

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: 'all', label: 'All' },
] as const

/** Every take, newest first, by question and period (docs/design/v2/app-history.html "All takes"). */
export default function HistoryScreen({ now = new Date() }: { now?: Date }) {
  const [questionId, setQuestionId] = useState('')
  const [period, setPeriod] = useState<Period>('30')
  const questions = useQuestions()
  const since = period === 'all' ? undefined : sinceDaysAgo(Number(period), now)
  const takes = useAllTakes({ questionId: questionId || undefined, since })
  const anyTakes = useAllTakes({ limit: 1 })

  const texts = useMemo(() => new Map((questions.data ?? []).map((q) => [q.id, q.text])), [questions.data])
  const best = useMemo(() => bestTakeIds(takes.data ?? []), [takes.data])
  const filtered = questionId !== '' || period !== 'all'

  if (anyTakes.isSuccess && anyTakes.data.length === 0) {
    return (
      <div className="history">
        <Head />
        <EmptyState
          icon="history"
          title="No takes yet"
          actions={
            <ButtonLink to={PATHS.questions} variant="primary">
              Practise a question
            </ButtonLink>
          }
        >
          After you transcribe an answer it shows up here, so you can see your fillers go down over time.
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="history">
      <Head />
      <div className="history__filters">
        <Field label="Question" hideLabel className="history__question">
          <Select value={questionId} onChange={(event) => setQuestionId(event.target.value)}>
            <option value="">All questions</option>
            {(questions.data ?? []).map((q) => (
              <option key={q.id} value={q.id}>
                {q.text}
              </option>
            ))}
          </Select>
        </Field>
        <Segmented<Period> label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      </div>

      {takes.isError && <LoadErrorBanner error={takes.error} title="Couldn't load your takes" onRetry={() => void takes.refetch()} />}
      {takes.isPending && <LoadingRows />}
      {takes.isSuccess && takes.data.length === 0 && (
        <EmptyState icon="history" title={filtered ? 'No takes in this period' : 'No takes yet'}>
          {filtered ? 'Try a longer period or all questions.' : 'Transcribe an answer and it shows up here.'}
        </EmptyState>
      )}
      {takes.isSuccess && takes.data.length > 0 && (
        <List as="div">
          {groupByDay(takes.data, now).map((group) => (
            <div key={group.label} role="group" aria-label={group.label}>
              <ListGroupLabel>{group.label}</ListGroupLabel>
              {group.takes.map((take) => (
                <TakeRow
                  key={take.id}
                  take={take}
                  title={texts.get(take.question_id) ?? 'Question'}
                  meta={[whenLabel(take, now), takeStats(take)].filter(Boolean).join(' · ')}
                  best={best.has(take.id)}
                />
              ))}
            </div>
          ))}
        </List>
      )}

      {questionId && (
        <p className="history__more">
          <Link to={questionHistoryPath(questionId)}>See progress for “{texts.get(questionId)}” →</Link>
        </p>
      )}
    </div>
  )
}

function Head() {
  return (
    <div className="history__head">
      <div className="history__title">
        <h1>History</h1>
        <p className="muted">Every take you've transcribed, newest first.</p>
      </div>
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="ui-list" aria-busy="true" aria-label="Loading takes">
      {['60%', '75%', '50%'].map((width) => (
        <div key={width} className="ui-row">
          <span className="ui-row__text">
            <Skeleton width={width} />
            <Skeleton width="30%" height={12} />
          </span>
        </div>
      ))}
    </div>
  )
}
