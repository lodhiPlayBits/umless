import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDelayedFlag } from './useDelayedFlag'

afterEach(() => vi.useRealTimers())

describe('useDelayedFlag', () => {
  it('turns on only after the delay, and off at once', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 300), { initialProps: { on: true } })
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe(true)
    rerender({ on: false })
    expect(result.current).toBe(false)
  })

  it('never turns on for a short load', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ on }) => useDelayedFlag(on, 300), { initialProps: { on: true } })
    act(() => vi.advanceTimersByTime(200))
    rerender({ on: false })
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(false)
  })
})
