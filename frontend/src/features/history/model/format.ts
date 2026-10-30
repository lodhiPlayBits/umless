import { daysBetween, takeTime } from '@/features/progress'
import type { TakeSummary } from '@/features/takes'

const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

/** "18:20" today, "Mon, 26 Oct" before. */
export function whenLabel(take: TakeSummary, now: Date): string {
  const at = takeTime(take)
  return daysBetween(at, now) <= 0 ? time.format(at) : weekday.format(at)
}

/** "26 Oct", for chart labels and "since". */
export function shortDay(date: Date): string {
  return shortDate.format(date)
}
