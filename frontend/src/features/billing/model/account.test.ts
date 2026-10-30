import { describe, expect, it } from 'vitest'
import { formatPracticeTime, practiceTimeLabel } from './account'
import type { Account } from '../api/billingApi'

const account = (free: number, seconds: number): Account => ({
  metered: true,
  free_transcriptions_left: free,
  seconds_left: seconds,
  packs: [],
})

describe('formatPracticeTime', () => {
  it.each([
    [0, '0 min'],
    [59, '0 min'],
    [3596, '59 min'],
    [3600, '1 h'],
    [17_700, '4 h 55 min'],
  ])('%i s is %s', (seconds, text) => {
    expect(formatPracticeTime(seconds)).toBe(text)
  })
})

describe('practiceTimeLabel', () => {
  it('shows free transcriptions first, then paid time, then a prompt to buy', () => {
    expect(practiceTimeLabel(account(3, 3600))).toBe('3 free left')
    expect(practiceTimeLabel(account(0, 3600))).toBe('1 h left')
    expect(practiceTimeLabel(account(0, 0))).toBe('Buy practice time')
  })
})
