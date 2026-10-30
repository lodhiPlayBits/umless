import { describe, expect, it } from 'vitest'
import { trendSummary, weekDelta } from './delta'

describe('weekDelta', () => {
  it('fewer fillers is better; more takes is better', () => {
    expect(weekDelta(2.1, 2.4, { lowerIsBetter: true, digits: 1 })).toEqual({ note: '↓ 0.3 vs last week', trend: 'better' })
    expect(weekDelta(9, 6, { lowerIsBetter: false })).toEqual({ note: '↑ 3 vs last week', trend: 'better' })
    expect(weekDelta(3, 6, { lowerIsBetter: false })).toEqual({ note: '↓ 3 vs last week', trend: 'worse' })
    expect(weekDelta(3.0, 2.4, { lowerIsBetter: true, digits: 1, unit: ' s' })).toEqual({ note: '↑ 0.6 s vs last week', trend: 'worse' })
  })

  it('says when nothing changed, at the shown precision', () => {
    expect(weekDelta(2.14, 2.11, { lowerIsBetter: true, digits: 1 })).toEqual({ note: 'Same as last week', trend: 'neutral' })
  })

  it('has nothing to compare without both weeks', () => {
    expect(weekDelta(2, null, { lowerIsBetter: true })).toBeNull()
    expect(weekDelta(null, 2, { lowerIsBetter: true })).toBeNull()
  })
})

describe('trendSummary', () => {
  it.each([
    [[{ value: 4.2 }, { value: 2.1 }], 'Down from 4.2 to 2.1: half as many fillers as when you started.'],
    [[{ value: 3 }, { value: 2.5 }], 'Down from 3.0 to 2.5.'],
    [[{ value: 2 }, { value: 3 }], 'Up from 2.0 to 3.0. Slow down and pause instead of filling.'],
    [[{ value: 2 }, { value: 2 }], 'Steady at 2.0 fillers per minute.'],
    [[{ value: 2 }], 'Your trend appears once you have practised in two different weeks.'],
  ])('%j', (points, text) => {
    expect(trendSummary(points)).toBe(text)
  })
})
