import { describe, expect, it } from 'vitest'
import { MAX_RECORDING_MS } from './recorder'
import { limitedByTimeLeft, recordingLimitMs } from './recordingLimit'

const left = (free: number, paid: number, metered = true) => ({ metered, free_seconds_left: free, seconds_left: paid })

describe('recordingLimitMs', () => {
  it('is the 10-minute limit when there is plenty of time left, free and paid together', () => {
    expect(recordingLimitMs(left(0, 3600))).toBe(MAX_RECORDING_MS)
    expect(recordingLimitMs(left(300, 300))).toBe(MAX_RECORDING_MS - 1000) // 10 min exactly: a second is held back
    expect(recordingLimitMs(left(3600, 7200))).toBe(MAX_RECORDING_MS)
  })

  it('stops at the time left, so every last second can be used: free and paid time add up', () => {
    expect(recordingLimitMs(left(0, 240))).toBe(239_000)
    expect(recordingLimitMs(left(60, 180))).toBe(239_000)
    expect(recordingLimitMs(left(20, 0))).toBe(19_000)
  })

  it('holds back one second, which a recording runs past its timer and the server rounds up', () => {
    expect(recordingLimitMs(left(0, 2))).toBe(1000)
  })

  it('keeps the 10-minute limit with no time left, so a recording can be made, then time bought', () => {
    expect(recordingLimitMs(left(0, 0))).toBe(MAX_RECORDING_MS)
    expect(recordingLimitMs(left(0, 1))).toBe(MAX_RECORDING_MS)
  })

  it('keeps the 10-minute limit where nothing is metered (local use) or the balance is unknown', () => {
    expect(recordingLimitMs(left(0, 30, false))).toBe(MAX_RECORDING_MS)
    expect(recordingLimitMs(null)).toBe(MAX_RECORDING_MS)
    expect(recordingLimitMs(undefined)).toBe(MAX_RECORDING_MS)
  })
})

describe('limitedByTimeLeft', () => {
  it('is true only below the 10-minute limit', () => {
    expect(limitedByTimeLeft(239_000)).toBe(true)
    expect(limitedByTimeLeft(MAX_RECORDING_MS)).toBe(false)
  })
})
