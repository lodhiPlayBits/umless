import { describe, expect, it } from 'vitest'
import { formatPracticeTime, practiceTimeLabel } from './account'
import type { Account } from '../api/billingApi'

const account = (free: number, seconds: number): Account => ({
  metered: true,
  free_seconds_left: free,
  seconds_left: seconds,
  packs: [],
})

describe('formatPracticeTime', () => {
  it.each([
    [0, '0 min'],
    [45, '45 s'],
    [59, '59 s'],
    [60, '1 min'],
    [3596, '59 min'],
    [3600, '1 h'],
    [17_700, '4 h 55 min'],
  ])('%i s is %s', (seconds, text) => {
    expect(formatPracticeTime(seconds)).toBe(text)
  })
})

describe('practiceTimeLabel', () => {
  it('shows everything that is left: free and paid time, or a prompt to buy', () => {
    // Paid time must show even while free time remains: a purchase looked lost otherwise.
    expect(practiceTimeLabel(account(5400, 3600))).toBe('1 h 30 min free + 1 h left')
    expect(practiceTimeLabel(account(1800, 5400))).toBe('30 min free + 1 h 30 min left')
    expect(practiceTimeLabel(account(5400, 0))).toBe('1 h 30 min free left')
    expect(practiceTimeLabel(account(40, 0))).toBe('40 s free left')
    expect(practiceTimeLabel(account(0, 3600))).toBe('1 h left')
    expect(practiceTimeLabel(account(0, 0))).toBe('Buy practice time')
  })
})
