// Regression tests for the Phase 2 code review.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PracticeScreen from './PracticeScreen'
import { ApiError } from './api'
import type { RecorderHandle, Recording } from './recorder'

const recording: Recording = {
  blob: new Blob(['audio'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 1000,
}

function renderScreen(handle: RecorderHandle, transcribe = vi.fn()) {
  const user = userEvent.setup()
  const view = render(
    <PracticeScreen
      startRecording={() => Promise.resolve(handle)}
      transcribe={transcribe}
      now={() => new Date(2026, 9, 18, 9, 5, 7)}
    />,
  )
  return { user, ...view }
}

describe('PracticeScreen robustness', () => {
  it('recovers when stopping the recorder fails', async () => {
    const handle = { mimeType: 'audio/webm', stop: vi.fn().mockRejectedValue(new Error('Recorder broke')) }
    const { user } = renderScreen(handle)

    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await user.click(await screen.findByRole('button', { name: 'Stop recording' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Recorder broke')
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument()
  })

  it('offers the audio download even when transcription fails', async () => {
    const handle = { mimeType: 'audio/webm', stop: vi.fn().mockResolvedValue(recording) }
    const transcribe = vi.fn().mockRejectedValue(new ApiError('Could not transcribe audio', 502))
    const { user } = renderScreen(handle, transcribe)

    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await user.click(await screen.findByRole('button', { name: 'Stop recording' }))
    await user.click(await screen.findByRole('button', { name: 'Transcribe' }))

    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Download audio' })).toHaveAttribute(
      'download',
      'practice-20261018-090507.webm',
    )
  })

  it('releases the microphone when unmounted mid-recording', async () => {
    const handle = { mimeType: 'audio/webm', stop: vi.fn().mockResolvedValue(recording) }
    const { user, unmount } = renderScreen(handle)

    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await screen.findByRole('button', { name: 'Stop recording' })
    unmount()

    expect(handle.stop).toHaveBeenCalledTimes(1)
  })
})
