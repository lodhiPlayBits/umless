import { afterEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './query'

afterEach(() => vi.useRealTimers())

describe('withTimeout', () => {
  it('aborts after the time limit', () => {
    vi.useFakeTimers()
    const signal = withTimeout(undefined, 1000)
    vi.advanceTimersByTime(999)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(1)
    expect(signal.aborted).toBe(true)
  })

  it('aborts at once when the outer signal aborts (navigating away, a newer load)', () => {
    const outer = new AbortController()
    const signal = withTimeout(outer.signal, 10_000)
    outer.abort()
    expect(signal.aborted).toBe(true)
  })

  it('is aborted already if the outer signal was', () => {
    const outer = new AbortController()
    outer.abort()
    expect(withTimeout(outer.signal).aborted).toBe(true)
  })
})
