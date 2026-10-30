import { describe, expect, it } from 'vitest'
import type { TakeSummary } from '@/features/takes'
import {
  bestTakeIds,
  dayGroup,
  fillersTrend,
  groupByDay,
  nextQuestion,
  paceNote,
  practiceStreak,
  questionProgress,
  relativeDay,
  sinceDaysAgo,
  usageByQuestion,
  weekComparison,
  weeklyTrend,
} from './progress'

// Local times, so "today" and day boundaries hold in any test time zone.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()
const NOW = new Date(2026, 9, 30, 15) // Fri 30 Oct 2026, 15:00

let n = 0
function take(created_at: string, fpm: number | null, question_id = 'q1', wpm: number | null = 140): TakeSummary {
  n += 1
  return {
    id: `t${n}`,
    question_id,
    created_at,
    duration_seconds: 60,
    summary: { word_count: 140, filler_count: 2, fillers: [], words_per_minute: wpm, fillers_per_minute: fpm, pause_count: 0, longest_pause_seconds: null },
  }
}

describe('dayGroup and groupByDay', () => {
  it.each([
    [at(2026, 10, 30, 1), 'Today'],
    [at(2026, 10, 29, 23), 'This week'],
    [at(2026, 10, 24), 'This week'],
    [at(2026, 10, 23), 'Earlier'],
  ])('%s is %s', (created, group) => {
    expect(dayGroup(take(created, 1), NOW)).toBe(group)
  })

  it('keeps order and leaves out empty groups', () => {
    const takes = [take(at(2026, 10, 30), 1), take(at(2026, 10, 10), 2), take(at(2026, 10, 1), 3)]
    expect(groupByDay(takes, NOW).map((g) => [g.label, g.takes.length])).toEqual([
      ['Today', 1],
      ['Earlier', 2],
    ])
  })
})

describe('relativeDay', () => {
  it.each([
    [new Date(2026, 9, 30, 0, 5), 'today'],
    [new Date(2026, 9, 29, 23), 'yesterday'],
    [new Date(2026, 9, 27), '3 days ago'],
    [new Date(2026, 9, 21), 'last week'],
    [new Date(2026, 9, 9), '3 weeks ago'],
  ])('%s → %s', (date, text) => {
    expect(relativeDay(date, NOW)).toBe(text)
  })

  it('uses the date after about a month', () => {
    expect(relativeDay(new Date(2026, 7, 1), NOW)).toMatch(/1|Aug/)
  })
})

describe('sinceDaysAgo', () => {
  it('starts at midnight, so it stays the same all day', () => {
    const morning = sinceDaysAgo(7, new Date(2026, 9, 30, 8))
    const evening = sinceDaysAgo(7, new Date(2026, 9, 30, 22))
    expect(morning).toBe(evening)
    expect(new Date(morning)).toEqual(new Date(2026, 9, 24))
  })
})

describe('usageByQuestion', () => {
  it('counts takes per question, with the latest time and rate', () => {
    const takes = [take(at(2026, 10, 30), 1.4), take(at(2026, 10, 28), 2.0, 'q2'), take(at(2026, 10, 20), 3.8)]
    const usage = usageByQuestion(takes)
    expect(usage.get('q1')).toEqual({ count: 2, lastAt: new Date(at(2026, 10, 30)), latestFillersPerMinute: 1.4 })
    expect(usage.get('q2')?.count).toBe(1)
    expect(usage.get('q3')).toBeUndefined()
  })
})

describe('bestTakeIds', () => {
  it('marks the fewest fillers per minute per question, only once practised twice', () => {
    const a = take(at(2026, 10, 30), 1.4)
    const b = take(at(2026, 10, 25), 1.2)
    const c = take(at(2026, 10, 20), 3.8)
    const only = take(at(2026, 10, 20), 0.5, 'q2')
    expect(bestTakeIds([a, b, c, only])).toEqual(new Set([b.id]))
  })

  it('marks nothing when every take has the same rate', () => {
    expect(bestTakeIds([take(at(2026, 10, 30), 2), take(at(2026, 10, 20), 2)])).toEqual(new Set())
  })

  it('a tie goes to the earlier take, and takes without a rate are skipped', () => {
    const newer = take(at(2026, 10, 30), 1.0)
    const none = take(at(2026, 10, 28), null)
    const older = take(at(2026, 10, 20), 1.0)
    const worst = take(at(2026, 10, 10), 2.5)
    expect(bestTakeIds([newer, none, older, worst])).toEqual(new Set([older.id]))
  })
})

describe('questionProgress', () => {
  it('summarises first, latest, best, change and pace', () => {
    const takes = [take(at(2026, 10, 30), 1.4, 'q1', 146), take(at(2026, 10, 25), 1.2, 'q1', 151), take(at(2026, 10, 6), 3.8, 'q1', 149)]
    const progress = questionProgress(takes)!
    expect(progress).toMatchObject({ count: 3, first: 3.8, latest: 1.4, averagePace: 149 })
    expect(progress.best).toEqual({ value: 1.2, at: new Date(at(2026, 10, 25)) })
    expect(progress.change).toBeCloseTo(-0.632, 3)
    expect(progress.firstAt).toEqual(new Date(at(2026, 10, 6)))
  })

  it('has no change for a single take, and nothing for none', () => {
    expect(questionProgress([take(at(2026, 10, 30), 2)])?.change).toBeNull()
    expect(questionProgress([])).toBeNull()
  })

  it('copes with values the server could not compute', () => {
    const progress = questionProgress([take(at(2026, 10, 30), null, 'q1', null), take(at(2026, 10, 1), null, 'q1', null)])!
    expect(progress).toMatchObject({ first: null, latest: null, best: null, change: null, averagePace: null })
  })
})

describe('fillersTrend', () => {
  it('goes oldest to newest and skips takes without a rate', () => {
    const takes = [take(at(2026, 10, 30), 1.4), take(at(2026, 10, 25), null), take(at(2026, 10, 6), 3.8)]
    expect(fillersTrend(takes, (t) => t.id).map((p) => p.value)).toEqual([3.8, 1.4])
  })
})

describe('weekComparison', () => {
  it('splits the last 7 days from the 7 before, with means', () => {
    const takes = [take(at(2026, 10, 30), 2.0, 'q1', 140), take(at(2026, 10, 24), 1.0, 'q1', 150), take(at(2026, 10, 20), 3.0, 'q1', 120), take(at(2026, 10, 1), 9, 'q1')]
    const { thisWeek, lastWeek } = weekComparison(takes, NOW)
    expect(thisWeek).toMatchObject({ count: 2, fillersPerMinute: 1.5, pace: 145 })
    expect(lastWeek).toMatchObject({ count: 1, fillersPerMinute: 3, pace: 120 })
  })

  it('has nulls for an empty week', () => {
    expect(weekComparison([], NOW).thisWeek).toEqual({ count: 0, fillersPerMinute: null, pace: null, longestPause: null })
  })
})

describe('practiceStreak', () => {
  it.each([
    ['today, yesterday and the day before', [30, 29, 28], 3],
    ['several takes on one day count once', [30, 30, 29], 2],
    ['not yet today, but yesterday: still alive', [29, 28], 2],
    ['a missed day breaks it', [30, 28, 27], 1],
    ['nothing since two days ago: gone', [28, 27], 0],
    ['no takes', [], 0],
  ])('%s → %i', (_, days, expected) => {
    expect(practiceStreak(days.map((d) => take(at(2026, 10, d), 1)), NOW)).toBe(expected)
  })
})

describe('weeklyTrend', () => {
  it('averages each 7-day span oldest first, skipping empty weeks, ending with Now', () => {
    const takes = [take(at(2026, 10, 30), 2.0), take(at(2026, 10, 26), 1.0), take(at(2026, 10, 10), 4.0)]
    expect(weeklyTrend(takes, NOW, (d) => `${d.getMonth() + 1}/${d.getDate()}`)).toEqual([
      { label: '10/10', value: 4 },
      { label: 'Now', value: 1.5 },
    ])
  })
})

describe('nextQuestion', () => {
  const qs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const usage = (entries: [string, number][]) =>
    new Map(entries.map(([id, day]) => [id, { count: 1, lastAt: new Date(2026, 9, day), latestFillersPerMinute: 1 }]))

  it('prefers the first question never practised', () => {
    expect(nextQuestion(qs, usage([['a', 30]]))).toEqual({ question: { id: 'b' }, reason: 'new' })
  })

  it('otherwise the one practised longest ago', () => {
    expect(nextQuestion(qs, usage([['a', 30], ['b', 12], ['c', 20]]))).toMatchObject({ question: { id: 'b' }, reason: 'oldest' })
  })

  it('is null without questions', () => {
    expect(nextQuestion([], new Map())).toBeNull()
  })
})

describe('paceNote', () => {
  it.each([
    [100, 'A little slow'],
    [130, 'In the 130–160 range'],
    [160, 'In the 130–160 range'],
    [175, 'A little fast'],
  ])('%i wpm → %s', (pace, note) => {
    expect(paceNote(pace)).toBe(note)
  })
})
