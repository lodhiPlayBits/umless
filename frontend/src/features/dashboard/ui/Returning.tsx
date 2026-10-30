import { useMemo } from 'react'
import { OutOfTimeBanner } from '@/features/billing'
import { TakeRow } from '@/features/history'
import type { Question } from '@/features/questions'
import { daysBetween, nextQuestion, paceNote, practiceStreak, relativeDay, usageByQuestion, weekComparison, weeklyTrend } from '@/features/progress'
import type { TakeSummary } from '@/features/takes'
import { takeStats } from '@/features/takes'
import { PATHS, practicePath } from '@/shared/config/paths'
import { Badge, ButtonLink, Link, LineChart, List, Panel, Stat } from '@/shared/ui'
import { trendSummary, weekDelta } from '../model/delta'

const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const RECENT = 4

type ReturningProps = { questions: readonly Question[]; takes: readonly TakeSummary[]; now: Date }

/** After the first take: streak, what to practise next, this week's numbers, the trend and recent takes. */
export default function Returning({ questions, takes, now }: ReturningProps) {
  const texts = useMemo(() => new Map(questions.map((q) => [q.id, q.text])), [questions])
  const next = nextQuestion(questions, usageByQuestion(takes))
  const { thisWeek, lastWeek } = weekComparison(takes, now)
  const streak = practiceStreak(takes, now)
  const practisedToday = takes.some((take) => daysBetween(new Date(take.created_at), now) === 0)
  const trend = weeklyTrend(takes, now, (start) => shortDate.format(start))

  const takesDelta = lastWeek.count || thisWeek.count ? weekDelta(thisWeek.count, lastWeek.count, { lowerIsBetter: false }) : null
  const fillersDelta = weekDelta(round(thisWeek.fillersPerMinute), round(lastWeek.fillersPerMinute), { lowerIsBetter: true, digits: 1 })
  const pauseDelta = weekDelta(round(thisWeek.longestPause), round(lastWeek.longestPause), { lowerIsBetter: true, digits: 1, unit: ' s' })

  return (
    <div className="dashboard">
      <div className="dashboard__head">
        <div>
          <h1>Welcome back</h1>
          <p className="muted">{streakLine(streak, practisedToday)}</p>
        </div>
        <ButtonLink to={PATHS.questions} icon="plus">
          Add question
        </ButtonLink>
      </div>

      <OutOfTimeBanner showBuy />

      {next && (
        <section className="dashboard__next" aria-labelledby="next-title">
          <div>
            <span className="dashboard__eyebrow">
              Practise next · {next.reason === 'new' ? 'not tried yet' : `last practised ${relativeDay(next.lastAt!, now)}`}
            </span>
            <p id="next-title" className="dashboard__next-q">
              {next.question.text}
            </p>
          </div>
          <ButtonLink to={practicePath(next.question.id)} variant="primary" size="lg" icon="mic">
            Start practising
          </ButtonLink>
        </section>
      )}

      <div className="dashboard__stats">
        <Stat label="Takes this week" value={thisWeek.count} note={takesDelta?.note} trend={takesDelta?.trend} />
        <Stat
          label="Fillers per minute"
          value={thisWeek.fillersPerMinute === null ? '—' : thisWeek.fillersPerMinute.toFixed(1)}
          note={fillersDelta?.note}
          trend={fillersDelta?.trend}
        />
        <Stat
          label="Average pace"
          value={thisWeek.pace === null ? '—' : Math.round(thisWeek.pace)}
          unit={thisWeek.pace === null ? undefined : 'wpm'}
          note={thisWeek.pace === null ? undefined : paceNote(thisWeek.pace)}
        />
        <Stat
          label="Longest pause, average"
          value={thisWeek.longestPause === null ? '—' : thisWeek.longestPause.toFixed(1)}
          unit={thisWeek.longestPause === null ? undefined : 's'}
          note={pauseDelta?.note}
          trend={pauseDelta?.trend}
        />
      </div>

      <div className="dashboard__grid">
        <Panel title="Fillers per minute" actions={<Badge>Last 8 weeks</Badge>}>
          {trend.length >= 2 && <LineChart points={trend} description={`Fillers per minute by week. ${trendSummary(trend)}`} />}
          <p className="muted">{trendSummary(trend)}</p>
        </Panel>
        <Panel title="Recent takes" actions={<Link to={PATHS.history}>See all</Link>}>
          {takes.length === 0 ? (
            <p className="muted">No takes in the last 8 weeks.</p>
          ) : (
            <List as="div" className="dashboard__recent">
              {takes.slice(0, RECENT).map((take) => (
                <TakeRow key={take.id} take={take} title={texts.get(take.question_id) ?? 'Question'} meta={`${relativeDay(new Date(take.created_at), now)} · ${takeStats(take)}`} />
              ))}
            </List>
          )}
        </Panel>
      </div>
    </div>
  )
}

const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10)

function streakLine(streak: number, practisedToday: boolean): string {
  if (streak >= 2) return `${streak} days in a row. Keep it going.`
  if (streak === 1 && practisedToday) return 'You practised today. Come back tomorrow to start a streak.'
  if (streak === 1) return 'You practised yesterday. Practise today to keep it going.'
  return 'Pick up where you left off.'
}
