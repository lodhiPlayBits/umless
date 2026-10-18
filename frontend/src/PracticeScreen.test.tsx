import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PracticeScreen from './PracticeScreen'
import { ApiError } from './api'
import type { TranscriptResult } from './api'
import { baseFileName, transcriptText } from './filenames'
import { extensionFor } from './recorder'
import type { RecorderHandle, Recording } from './recorder'

const NOW = new Date(2026, 9, 18, 9, 5, 7)
const now = () => NOW

function makeRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    blob: new Blob(['audio-bytes'], { type: 'audio/webm' }),
    mimeType: 'audio/webm',
    durationMs: 2000,
    ...overrides,
  }
}

function makeResult(text = 'hello there'): TranscriptResult {
  return { text, words: [], duration_seconds: 2 }
}

type Props = ComponentProps<typeof PracticeScreen>
type StartFn = NonNullable<Props['startRecording']>
type TranscribeFn = NonNullable<Props['transcribe']>

const blobs = new Map<string, Blob>()
const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeEach(() => {
  blobs.clear()
  let n = 0
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    const url = `blob:mock/${++n}`
    blobs.set(url, blob as Blob)
    return url
  })
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})

function setup(opts: { recording?: Recording; transcribe?: TranscribeFn; start?: StartFn } = {}) {
  const recording = opts.recording ?? makeRecording()
  const handle: RecorderHandle = {
    mimeType: recording.mimeType,
    stop: vi.fn().mockResolvedValue(recording),
  }
  const start = vi.fn<StartFn>(opts.start ?? (() => Promise.resolve(handle)))
  const transcribe = vi.fn<TranscribeFn>(opts.transcribe ?? (() => Promise.resolve(makeResult())))
  const user = userEvent.setup()
  render(<PracticeScreen startRecording={start} transcribe={transcribe} now={now} />)
  return { user, start, transcribe, handle, recording }
}

async function recordOnce(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Start recording' }))
  await user.click(await screen.findByRole('button', { name: 'Stop recording' }))
  await screen.findByRole('button', { name: 'Transcribe' })
}

describe('PracticeScreen idle state', () => {
  it('shows the question input and a start button', () => {
    setup()
    expect(screen.getByLabelText('Question')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument()
  })
})

describe('PracticeScreen recording', () => {
  it('starts recording with an onAutoStop option and swaps the buttons', async () => {
    const { user, start } = setup()
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toEqual(
      expect.objectContaining({ onAutoStop: expect.any(Function) }),
    )
    expect(await screen.findByRole('button', { name: 'Stop recording' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument()
  })

  it('shows the error and allows retry when starting fails', async () => {
    const { user } = setup({
      start: () => Promise.reject(new Error('Microphone access was denied')),
    })
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was denied')
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument()
  })

  it('stops the recorder and shows a player for the recording', async () => {
    const { user, handle, recording } = setup()
    await recordOnce(user)
    expect(handle.stop).toHaveBeenCalledTimes(1)
    const audio = document.querySelector('audio')
    expect(audio).not.toBeNull()
    expect(audio).toHaveAttribute('controls')
    expect(blobs.get(audio!.getAttribute('src')!)).toBe(recording.blob)
    expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument()
  })

  it('disables transcribing an empty recording and says so', async () => {
    const { user } = setup({
      recording: makeRecording({ blob: new Blob([], { type: 'audio/webm' }) }),
    })
    await recordOnce(user)
    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDisabled()
    expect(screen.getByText('Recording is empty')).toBeInTheDocument()
  })

  it('moves to the recorded state when the recorder auto-stops', async () => {
    const recording = makeRecording()
    let autoStop: ((r: Recording) => void) | undefined
    const { user } = setup({
      recording,
      start: (options) => {
        autoStop = options?.onAutoStop
        return Promise.resolve({ mimeType: 'audio/webm', stop: vi.fn() })
      },
    })
    await user.click(screen.getByRole('button', { name: 'Start recording' }))
    await screen.findByRole('button', { name: 'Stop recording' })

    expect(autoStop).toBeDefined()
    autoStop!(recording)

    expect(await screen.findByRole('button', { name: 'Transcribe' })).toBeEnabled()
    expect(document.querySelector('audio')).toHaveAttribute('controls')
    expect(screen.queryByRole('button', { name: 'Stop recording' })).not.toBeInTheDocument()
  })
})

describe('PracticeScreen transcription', () => {
  it('sends the recording blob to transcribe', async () => {
    const { user, transcribe, recording } = setup()
    await recordOnce(user)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(transcribe.mock.calls[0][0]).toBe(recording.blob)
  })

  it('shows progress and disables Transcribe while pending', async () => {
    let resolve: (r: TranscriptResult) => void = () => {}
    const { user } = setup({
      transcribe: () => new Promise<TranscriptResult>((r) => (resolve = r)),
    })
    await recordOnce(user)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))
    expect(screen.getByText('Transcribing…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeDisabled()
    resolve(makeResult())
    await screen.findByRole('heading', { name: 'Transcript' })
  })

  it('shows the transcript and download links on success', async () => {
    const { user, recording } = setup({
      transcribe: () => Promise.resolve(makeResult('I am the transcript')),
    })
    await user.type(screen.getByLabelText('Question'), 'Why umless?')
    await recordOnce(user)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))

    expect(await screen.findByRole('heading', { name: 'Transcript' })).toBeInTheDocument()
    expect(screen.getByText('I am the transcript')).toBeInTheDocument()

    const base = baseFileName('Why umless?', NOW)
    const textLink = screen.getByRole('link', { name: 'Download transcript' })
    expect(textLink).toHaveAttribute('download', `${base}.txt`)
    const textBlob = blobs.get(textLink.getAttribute('href')!)!
    expect(textBlob.type).toBe('text/plain')
    expect(await textBlob.text()).toBe(transcriptText('Why umless?', 'I am the transcript'))

    const audioLink = screen.getByRole('link', { name: 'Download audio' })
    expect(audioLink).toHaveAttribute('download', `${base}.${extensionFor(recording.mimeType)}`)
    expect(blobs.get(audioLink.getAttribute('href')!)).toBe(recording.blob)
  })

  it('names the audio download after the recording mime type', async () => {
    const { user } = setup({
      recording: makeRecording({
        mimeType: 'audio/mp4',
        blob: new Blob(['x'], { type: 'audio/mp4' }),
      }),
    })
    await recordOnce(user)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))
    const link = await screen.findByRole('link', { name: 'Download audio' })
    expect(link).toHaveAttribute('download', `${baseFileName('', NOW)}.m4a`)
  })

  it('shows the error and re-enables Transcribe on failure', async () => {
    const { user } = setup({
      transcribe: () => Promise.reject(new ApiError('Could not transcribe audio', 502)),
    })
    await recordOnce(user)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not transcribe audio')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Transcribe' })).toBeEnabled())
    expect(screen.queryByRole('heading', { name: 'Transcript' })).not.toBeInTheDocument()
  })

  it('returns to idle and clears the transcript on Record again', async () => {
    const { user } = setup()
    await recordOnce(user)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))
    await screen.findByRole('heading', { name: 'Transcript' })

    await user.click(screen.getByRole('button', { name: 'Record again' }))

    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Transcript' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download transcript' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Download audio' })).not.toBeInTheDocument()
    expect(document.querySelector('audio')).toBeNull()
  })
})
