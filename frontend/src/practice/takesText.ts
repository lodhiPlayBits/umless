import { formatClock } from '../timeLabel'
import type { TakeSummary } from './takesApi'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function takeDate(take: { created_at: string }): string {
  return dateFormat.format(new Date(take.created_at))
}

/** "1:05 · 132 wpm · 2.4 fillers/min"; values the server couldn't compute are left out. */
export function takeStats(take: TakeSummary): string {
  const { summary } = take
  const parts = [take.duration_seconds ? formatClock(take.duration_seconds * 1000) : null]
  if (summary.words_per_minute !== null) parts.push(`${summary.words_per_minute} wpm`)
  if (summary.fillers_per_minute !== null) parts.push(`${summary.fillers_per_minute.toFixed(1)} fillers/min`)
  return parts.filter(Boolean).join(' · ')
}
