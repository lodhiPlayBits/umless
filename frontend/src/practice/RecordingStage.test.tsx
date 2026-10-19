import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecordingStage from './RecordingStage'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function setup(level: () => number | null, maxMs = 65_000) {
  const onStop = vi.fn()
  const onCancel = vi.fn()
  const view = render(
    <RecordingStage startedAt={Date.now()} level={level} onStop={onStop} onCancel={onCancel} maxMs={maxMs} />,
  )
  return { onStop, onCancel, ...view }
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const timer = () => screen.getByRole('timer')

describe('RecordingStage', () => {
  it('shows the elapsed time and a Stop button before the final minute', () => {
    const { onStop } = setup(() => 0.5, 600_000)
    advance(3000)
    expect(timer()).toHaveTextContent('0:03')
    act(() => screen.getByRole('button', { name: 'Stop recording' }).click())
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel from Cancel take', () => {
    const { onCancel } = setup(() => 0.5)
    act(() => screen.getByRole('button', { name: 'Cancel take' }).click())
    expect(onCancel).toHaveBeenCalled()
  })

  it('switches to "Time left m:ss" in the final minute and announces 1 minute and 10 seconds', () => {
    setup(() => 0.5)
    advance(1000)
    expect(timer()).toHaveTextContent('0:01')
    advance(4000) // 60 s remain
    expect(timer()).toHaveTextContent('Time left 1:00')
    expect(screen.getByText('1 minute left')).toBeInTheDocument()
    advance(50_000) // 10 s remain
    expect(timer()).toHaveTextContent('Time left 0:10')
    expect(screen.getByText('10 seconds left')).toBeInTheDocument()
  })

  it('shows "We can\'t hear you" after 5 s of silence', () => {
    setup(() => 0, 600_000)
    advance(3000)
    expect(screen.queryByText("We can't hear you")).not.toBeInTheDocument()
    advance(2500)
    expect(screen.getByText("We can't hear you")).toBeInTheDocument()
  })

  it('does not show the quiet hint while there is sound', () => {
    setup(() => 0.5, 600_000)
    advance(10_000)
    expect(screen.queryByText("We can't hear you")).not.toBeInTheDocument()
  })

  it('does not show the quiet hint or a meter when the level is unavailable (null)', () => {
    const { container } = setup(() => null, 600_000)
    advance(10_000)
    expect(screen.queryByText("We can't hear you")).not.toBeInTheDocument()
    expect(container.querySelector('.meter')).toBeNull()
  })
})
