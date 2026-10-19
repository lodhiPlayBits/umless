import { describe, expect, it } from 'vitest'
import { formatClock, recordingLabel } from './timeLabel'

const TEN_MIN = 600_000

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [65_000, '1:05'],
    [600_000, '10:00'],
    [-5, '0:00'],
  ])('formats %i ms as %s', (ms, label) => {
    expect(formatClock(ms)).toBe(label)
  })
})

describe('recordingLabel', () => {
  it('shows elapsed time before the final minute', () => {
    expect(recordingLabel(12_000, TEN_MIN)).toBe('0:12')
    expect(recordingLabel(538_999, TEN_MIN)).toBe('8:58')
  })

  it('counts down in the final minute', () => {
    expect(recordingLabel(540_000, TEN_MIN)).toBe('Time left 1:00')
    expect(recordingLabel(570_500, TEN_MIN)).toBe('Time left 0:30')
    expect(recordingLabel(TEN_MIN, TEN_MIN)).toBe('Time left 0:00')
  })
})
