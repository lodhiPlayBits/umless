import type { StatTrend } from '@/shared/ui'

type DeltaOptions = {
  /** Fillers and pauses: down is good. Takes: up is good. */
  lowerIsBetter: boolean
  digits?: number
  unit?: string
}

/** "↓ 0.3 vs last week" and whether that's better or worse; null when either week has no value. */
export function weekDelta(current: number | null, previous: number | null, { lowerIsBetter, digits = 0, unit = '' }: DeltaOptions): { note: string; trend: StatTrend } | null {
  if (current === null || previous === null) return null
  const diff = Number((current - previous).toFixed(digits))
  if (diff === 0) return { note: 'Same as last week', trend: 'neutral' }
  const better = lowerIsBetter ? diff < 0 : diff > 0
  return {
    note: `${diff < 0 ? '↓' : '↑'} ${Math.abs(diff).toFixed(digits)}${unit} vs last week`,
    trend: better ? 'better' : 'worse',
  }
}

/** The line under the chart: how the first and last week compare. */
export function trendSummary(points: readonly { value: number }[]): string {
  if (points.length < 2) return 'Your trend appears once you have practised in two different weeks.'
  const first = points[0].value
  const last = points[points.length - 1].value
  if (last < first) {
    const half = last <= first / 2 ? ': half as many fillers as when you started' : ''
    return `Down from ${first.toFixed(1)} to ${last.toFixed(1)}${half}.`
  }
  if (last > first) return `Up from ${first.toFixed(1)} to ${last.toFixed(1)}. Slow down and pause instead of filling.`
  return `Steady at ${last.toFixed(1)} fillers per minute.`
}
