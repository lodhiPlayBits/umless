import type { TakeSummary } from '@/features/takes'

// Every number History and the Dashboard show, as plain functions over takes (ADR 0005
// decision 6). Takes come newest first, as the API returns them. Components only format results.

const DAY_MS = 24 * 60 * 60 * 1000

/** Fillers per minute at or above this read as high (amber). */
export const HIGH_FILLERS_PER_MINUTE = 3

export function takeTime(take: Pick<TakeSummary, 'created_at'>): Date {
  return new Date(take.created_at)
}

export function fillersPerMinute(take: TakeSummary): number | null {
  return take.summary.fillers_per_minute
}

/** Midnight at the start of `date`'s day, in the viewer's time zone. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** Whole calendar days between two dates (0 = same day), in the viewer's time zone. */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.round((startOfDay(later).getTime() - startOfDay(earlier).getTime()) / DAY_MS)
}

/**
 * The start of the day `days` days ago, as an ISO string: a `since` filter that stays the same
 * all day, so query keys built from it don't change on every render.
 */
export function sinceDaysAgo(days: number, now: Date): string {
  const start = startOfDay(now)
  start.setDate(start.getDate() - (days - 1))
  return start.toISOString()
}

export type DayGroup = 'Today' | 'This week' | 'Earlier'

export function dayGroup(take: TakeSummary, now: Date): DayGroup {
  const days = daysBetween(takeTime(take), now)
  if (days <= 0) return 'Today'
  if (days < 7) return 'This week'
  return 'Earlier'
}

/** Takes split into Today / This week / Earlier, keeping their order; empty groups are left out. */
export function groupByDay(takes: readonly TakeSummary[], now: Date): { label: DayGroup; takes: TakeSummary[] }[] {
  const groups = new Map<DayGroup, TakeSummary[]>()
  for (const take of takes) {
    const label = dayGroup(take, now)
    groups.set(label, [...(groups.get(label) ?? []), take])
  }
  return [...groups].map(([label, items]) => ({ label, takes: items }))
}

/** "today", "yesterday", "3 days ago", "last week", "2 weeks ago", then the date. */
export function relativeDay(date: Date, now: Date): string {
  const days = daysBetween(date, now)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 35) return `${Math.floor(days / 7)} weeks ago`
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

export type QuestionUsage = {
  count: number
  lastAt: Date
  /** The most recent take's fillers per minute. */
  latestFillersPerMinute: number | null
}

/** Per question: how often it was practised, when last, and the latest fillers per minute. */
export function usageByQuestion(takes: readonly TakeSummary[]): Map<string, QuestionUsage> {
  const usage = new Map<string, QuestionUsage>()
  for (const take of takes) {
    const seen = usage.get(take.question_id)
    if (seen) seen.count += 1
    else usage.set(take.question_id, { count: 1, lastAt: takeTime(take), latestFillersPerMinute: fillersPerMinute(take) })
  }
  return usage
}

/**
 * The take with the fewest fillers per minute, per question, among questions practised at least
 * twice. Only when it actually beat another take: equal rates have no best.
 */
export function bestTakeIds(takes: readonly TakeSummary[]): Set<string> {
  const byQuestion = new Map<string, TakeSummary[]>()
  for (const take of takes) byQuestion.set(take.question_id, [...(byQuestion.get(take.question_id) ?? []), take])
  const ids = new Set<string>()
  for (const group of byQuestion.values()) {
    if (group.length < 2) continue
    let best: TakeSummary | null = null
    // Newest first, so `<=` lets an older take win a tie: matching your best isn't beating it.
    for (const take of group) {
      const value = fillersPerMinute(take)
      if (value !== null && (best === null || value <= fillersPerMinute(best)!)) best = take
    }
    const rates = group.map(fillersPerMinute).filter((rate): rate is number => rate !== null)
    if (best && fillersPerMinute(best)! < Math.max(...rates)) ids.add(best.id)
  }
  return ids
}

export type QuestionProgress = {
  count: number
  firstAt: Date
  first: number | null
  latest: number | null
  best: { value: number; at: Date } | null
  /** Latest vs first as a fraction (-0.63 = 63% fewer fillers per minute); null without both. */
  change: number | null
  averagePace: number | null
}

/** One question's progress from its takes (newest first). Null when there are none. */
export function questionProgress(takes: readonly TakeSummary[]): QuestionProgress | null {
  if (takes.length === 0) return null
  const oldest = takes[takes.length - 1]
  const first = fillersPerMinute(oldest)
  const latest = fillersPerMinute(takes[0])
  let best: QuestionProgress['best'] = null
  for (const take of takes) {
    const value = fillersPerMinute(take)
    if (value !== null && (!best || value < best.value)) best = { value, at: takeTime(take) }
  }
  const paces = takes.map((take) => take.summary.words_per_minute).filter((pace): pace is number => pace !== null)
  return {
    count: takes.length,
    firstAt: takeTime(oldest),
    first,
    latest,
    best,
    change: first && latest !== null && takes.length > 1 ? (latest - first) / first : null,
    averagePace: paces.length ? Math.round(paces.reduce((a, b) => a + b, 0) / paces.length) : null,
  }
}

/** Chart points, oldest to newest, skipping takes without a rate. */
export function fillersTrend(takes: readonly TakeSummary[], label: (take: TakeSummary) => string): { label: string; value: number }[] {
  return [...takes]
    .reverse()
    .flatMap((take) => {
      const value = fillersPerMinute(take)
      return value === null ? [] : [{ label: label(take), value }]
    })
}

// --- Dashboard ---------------------------------------------------------------------------

/** A comfortable speaking pace for answers, in words per minute. */
export const PACE_RANGE = { low: 130, high: 160 } as const

export type WeekSummary = {
  count: number
  /** Mean of the takes' fillers per minute; null without any. */
  fillersPerMinute: number | null
  pace: number | null
  /** Mean longest pause, in seconds, over takes that had a long pause. */
  longestPause: number | null
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)

function summarise(takes: readonly TakeSummary[]): WeekSummary {
  const present = <T,>(values: (T | null)[]) => values.filter((v): v is T => v !== null)
  return {
    count: takes.length,
    fillersPerMinute: mean(present(takes.map(fillersPerMinute))),
    pace: mean(present(takes.map((t) => t.summary.words_per_minute))),
    longestPause: mean(present(takes.map((t) => t.summary.longest_pause_seconds))),
  }
}

/** This week (the last 7 days, today included) against the 7 days before. */
export function weekComparison(takes: readonly TakeSummary[], now: Date): { thisWeek: WeekSummary; lastWeek: WeekSummary } {
  const age = (take: TakeSummary) => daysBetween(takeTime(take), now)
  return {
    thisWeek: summarise(takes.filter((t) => age(t) < 7)),
    lastWeek: summarise(takes.filter((t) => age(t) >= 7 && age(t) < 14)),
  }
}

/**
 * Days in a row with at least one take, ending today, or yesterday if there's nothing today yet
 * (the streak isn't lost until a whole day is missed).
 */
export function practiceStreak(takes: readonly TakeSummary[], now: Date): number {
  const days = new Set(takes.map((take) => daysBetween(takeTime(take), now)))
  let day = days.has(0) ? 0 : 1
  let streak = 0
  while (days.has(day)) {
    streak += 1
    day += 1
  }
  return streak
}

/**
 * Mean fillers per minute for each of the last `weeks` 7-day spans, oldest first. Weeks without
 * a rate are left out rather than drawn as zero. Labels are each span's first day; the last is "Now".
 */
export function weeklyTrend(
  takes: readonly TakeSummary[],
  now: Date,
  label: (start: Date) => string,
  weeks = 8,
): { label: string; value: number }[] {
  const points: { label: string; value: number }[] = []
  for (let week = weeks - 1; week >= 0; week -= 1) {
    const inWeek = takes.filter((take) => Math.floor(daysBetween(takeTime(take), now) / 7) === week)
    const value = summarise(inWeek).fillersPerMinute
    if (value === null) continue
    const start = startOfDay(now)
    start.setDate(start.getDate() - week * 7 - 6)
    points.push({ label: week === 0 ? 'Now' : label(start), value: Math.round(value * 10) / 10 })
  }
  return points
}

export type NextQuestion<Q> = { question: Q; reason: 'new' | 'oldest'; lastAt?: Date }

/** What to practise next: the first question never practised, else the one practised longest ago. */
export function nextQuestion<Q extends { id: string }>(questions: readonly Q[], usage: Map<string, QuestionUsage>): NextQuestion<Q> | null {
  const fresh = questions.find((q) => !usage.has(q.id))
  if (fresh) return { question: fresh, reason: 'new' }
  let oldest: NextQuestion<Q> | null = null
  for (const question of questions) {
    const lastAt = usage.get(question.id)!.lastAt
    if (!oldest || lastAt < oldest.lastAt!) oldest = { question, reason: 'oldest', lastAt }
  }
  return oldest
}

/** "In the 130–160 range", "A little fast", "A little slow". */
export function paceNote(pace: number): string {
  if (pace < PACE_RANGE.low) return 'A little slow'
  if (pace > PACE_RANGE.high) return 'A little fast'
  return `In the ${PACE_RANGE.low}–${PACE_RANGE.high} range`
}
