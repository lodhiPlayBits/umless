import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetAccount, setAccount } from '../billing/account'
import { ApiError } from '../client'
import { RecorderError } from '../recorder'
import type { AutoStopReason, Recording } from '../recorder'
import { navigate } from '../router'
import PracticeSession from './PracticeSession'
import type { Transcript } from './practiceApi'

type StartOptions = { onAutoStop: (recording: Recording, reason?: AutoStopReason) => void }

const question = { id: 'q1', text: 'Tell me about yourself.', created_at: '2026-01-01T00:00:00Z' }
const practice = { question, number: 2, total: 3, nextId: 'q2' as string | null }
const audio = (size = 3): Recording => ({
  blob: new Blob(['a'.repeat(size)], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 65_000,
})
const word = (w: string, start: number) => ({
  word: w.toLowerCase(),
  punctuated_word: w,
  start,
  end: start + 0.3,
  confidence: 0.9,
  is_filler: false,
  pause_before_seconds: 0,
})
// A contract-valid Transcript (docs/api/openapi.yaml): words, duration and a full summary.
const transcript: Transcript = {
  text: 'Hello there world',
  words: [word('Hello', 0), word('there', 0.3), word('world', 0.6)],
  duration_seconds: 1,
  summary: {
    word_count: 3,
    filler_count: 0,
    fillers: [],
    words_per_minute: 180,
    fillers_per_minute: 0,
    pause_count: 0,
    longest_pause_seconds: null,
  },
}
const fixedNow = () => new Date(2026, 9, 19, 14, 5, 9)
const g = globalThis as Record<string, unknown>

let originalMediaRecorder: unknown
let originalMediaDevices: PropertyDescriptor | undefined

function setSupported(on: boolean) {
  if (on) {
    g.MediaRecorder = class {}
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
  } else {
    delete g.MediaRecorder
  }
}

beforeEach(() => {
  originalMediaRecorder = g.MediaRecorder
  originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  setSupported(true)
  window.history.pushState(null, '', '/practice/q1')
  document.title = 'umless'
})

afterEach(() => {
  g.MediaRecorder = originalMediaRecorder
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else delete (navigator as unknown as Record<string, unknown>).mediaDevices
  window.history.pushState(null, '', '/')
})

function setup(
  opts: {
    recording?: Recording
    transcribe?: (b: Blob) => Promise<Transcript>
    serverUp?: boolean | null
    practiceProp?: typeof practice
  } = {},
) {
  const takes = { list: vi.fn().mockResolvedValue([]), get: vi.fn(), remove: vi.fn() }
  const recording = opts.recording ?? audio()
  const stop = vi.fn().mockResolvedValue(recording)
  const handle = { mimeType: recording.mimeType, stop, level: () => 0.5 }
  let options!: StartOptions
  const startRecording = vi.fn((o: StartOptions) => {
    options = o
    return Promise.resolve(handle)
  })
  const transcribe = vi.fn(opts.transcribe ?? (() => Promise.resolve(transcript)))
  const props = (p = opts.practiceProp ?? practice) => ({
    practice: p,
    serverUp: opts.serverUp ?? true,
    startRecording: startRecording as never,
    transcribe,
    takes,
    now: fixedNow,
  })
  const view = render(<PracticeSession {...props()} />)
  return { ...view, props, startRecording, transcribe, takes, stop, autoStop: () => options.onAutoStop, user: userEvent.setup() }
}

const startBtn = () => screen.getByRole('button', { name: 'Start recording' })
const stopBtn = () => screen.findByRole('button', { name: 'Stop recording' })

async function record(s: ReturnType<typeof setup>) {
  await s.user.click(startBtn())
  await s.user.click(await stopBtn())
  await screen.findByRole('button', { name: 'Transcribe' })
}

describe('PracticeSession ready', () => {
  it('shows the question, position, privacy note, Start and a Next link', () => {
    setup()
    expect(screen.getByRole('heading', { name: 'Tell me about yourself.' })).toBeInTheDocument()
    expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
    expect(screen.getByText(/stays in this browser tab/)).toBeInTheDocument()
    expect(startBtn()).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next question →' })).toHaveAttribute('href', '/practice/q2')
  })

  it('has no Next link on the last question', () => {
    setup({ practiceProp: { ...practice, number: 3, nextId: null } })
    expect(screen.queryByRole('link', { name: /Next question/ })).not.toBeInTheDocument()
  })

  it('shows the Server offline banner only when serverUp is false', () => {
    const a = setup({ serverUp: false })
    expect(screen.getByText('Server offline')).toBeInTheDocument()
    a.unmount()
    for (const up of [true, null]) {
      const s = setup({ serverUp: up })
      expect(screen.queryByText('Server offline')).not.toBeInTheDocument()
      s.unmount()
    }
  })
})

describe('PracticeSession unsupported and mic errors', () => {
  it("shows \"This browser can't record audio\" with Back to questions", () => {
    setSupported(false)
    setup()
    expect(screen.getByText("This browser can't record audio")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to questions' })).toHaveAttribute('href', '/')
  })

  it('explains a denied microphone with steps, and Try again starts recording again', async () => {
    const s = setup()
    s.startRecording.mockRejectedValueOnce(new RecorderError('denied', 'denied'))
    await s.user.click(startBtn())
    expect(await screen.findByText('umless needs your microphone')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
    await s.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(s.startRecording).toHaveBeenCalledTimes(2)
    expect(await stopBtn()).toBeInTheDocument()
  })

  it('shows "No microphone found" for a missing microphone', async () => {
    const s = setup()
    s.startRecording.mockRejectedValueOnce(new RecorderError('none', 'no-mic'))
    await s.user.click(startBtn())
    expect(await screen.findByText('No microphone found')).toBeInTheDocument()
  })
})

describe('PracticeSession recording', () => {
  it('shows the timer and Stop while recording, and sets then restores the tab title', async () => {
    const s = setup()
    await s.user.click(startBtn())
    await stopBtn()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(document.title).toBe('● Recording · umless')
    await s.user.click(await stopBtn())
    await screen.findByRole('button', { name: 'Transcribe' })
    expect(document.title).toBe('umless')
  })

  it('Space starts and stops recording when focus is not on a control', async () => {
    const s = setup()
    fireEvent.keyDown(document.body, { key: ' ' })
    await stopBtn()
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(await screen.findByRole('button', { name: 'Transcribe' })).toBeInTheDocument()
    expect(s.stop).toHaveBeenCalledTimes(1)
  })

  it('ignores Space while focus is on a button', () => {
    const s = setup()
    fireEvent.keyDown(startBtn(), { key: ' ' })
    expect(s.startRecording).not.toHaveBeenCalled()
  })

  it('ignores a second Stop', async () => {
    const s = setup()
    await s.user.click(startBtn())
    const stop = await stopBtn()
    act(() => {
      stop.click()
      stop.click()
    })
    await screen.findByRole('button', { name: 'Transcribe' })
    expect(s.stop).toHaveBeenCalledTimes(1)
  })
})

describe('PracticeSession review', () => {
  it('shows the player, duration, unsaved note, actions and a dated download name', async () => {
    const s = setup()
    await record(s)
    expect(screen.getByLabelText('Your recording')).toBeInTheDocument()
    expect(screen.getByText('1:05')).toBeInTheDocument()
    expect(screen.getByText(/Not saved anywhere yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '⬇ Audio' })).toHaveAttribute(
      'download',
      'tell-me-about-yourself-20261019-140509.webm',
    )
  })

  it('explains a stop at the 10-minute limit', async () => {
    const s = setup()
    await s.user.click(startBtn())
    await stopBtn()
    act(() => s.autoStop()(audio(), 'limit'))
    expect(await screen.findByText('Stopped at the 10-minute limit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeInTheDocument()
  })

  it('explains a disconnected microphone and the kept duration', async () => {
    const s = setup()
    await s.user.click(startBtn())
    await stopBtn()
    act(() => s.autoStop()(audio(), 'device-lost'))
    expect(await screen.findByText('Recording stopped: the microphone was disconnected')).toBeInTheDocument()
    expect(screen.getByText(/We kept the 1:05/)).toBeInTheDocument()
  })

  it('shows "Nothing was recorded" with Record again for an empty blob', async () => {
    const s = setup({ recording: audio(0) })
    await s.user.click(startBtn())
    await s.user.click(await stopBtn())
    expect(await screen.findByText('Nothing was recorded')).toBeInTheDocument()
    await s.user.click(screen.getByRole('button', { name: 'Record again' }))
    expect(startBtn()).toBeInTheDocument()
  })
})

describe('PracticeSession transcription', () => {
  it('shows Transcribing… (Transcribe hidden), then the transcript', async () => {
    let resolve!: (t: Transcript) => void
    const s = setup({ transcribe: () => new Promise((r) => (resolve = r)) })
    await record(s)
    await s.user.click(screen.getByRole('button', { name: 'Transcribe' }))
    expect(screen.getByText('Transcribing…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Transcribe' })).not.toBeInTheDocument()
    await act(async () => resolve(transcript))
    expect(await screen.findByText('Hello there world')).toBeInTheDocument()
  })

  const failures: [string, number, ApiError['code'], string][] = [
    ['unreachable', 0, undefined, "Can't reach the umless server"],
    ['failed', 502, 'transcription_failed', 'Transcription failed'],
    ['unavailable', 503, 'transcription_unavailable', "Transcription isn't set up"],
    ['too large', 413, 'audio_too_large', 'This recording is over 25 MB'],
    ['empty', 400, 'empty_audio', 'Nothing was recorded'],
  ]
  for (const [name, status, code, title] of failures) {
    it(`shows "${title}" when transcription fails (${name})`, async () => {
      const s = setup({ transcribe: () => Promise.reject(new ApiError('x', status, code)) })
      await record(s)
      await s.user.click(screen.getByRole('button', { name: 'Transcribe' }))
      expect(await screen.findByText(title)).toBeInTheDocument()
      if (code === 'empty_audio') {
        expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument()
      } else {
        // the recording is kept
        expect(screen.getByLabelText('Your recording')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: '⬇ Audio' })).toBeInTheDocument()
      }
      if (code === 'audio_too_large') expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    })
  }

  it('Try again calls transcribe again', async () => {
    const transcribe = vi.fn().mockRejectedValueOnce(new ApiError('x', 0)).mockResolvedValue(transcript)
    const s = setup({ transcribe })
    await record(s)
    await s.user.click(screen.getByRole('button', { name: 'Transcribe' }))
    await s.user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Hello there world')).toBeInTheDocument()
    expect(transcribe).toHaveBeenCalledTimes(2)
  })
})

describe('PracticeSession record again', () => {
  it('asks "Record again?" first when the audio was not downloaded', async () => {
    const s = setup()
    await record(s)
    await s.user.click(screen.getByRole('button', { name: 'Record again' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText('Record again?')).toBeInTheDocument()
    await s.user.click(within(dialog).getByRole('button', { name: 'Record again' }))
    expect(startBtn()).toBeInTheDocument()
  })

  it('goes straight back to ready after the audio was downloaded', async () => {
    const s = setup()
    await record(s)
    const link = screen.getByRole('link', { name: '⬇ Audio' })
    link.addEventListener('click', (e) => e.preventDefault())
    await s.user.click(link)
    await s.user.click(screen.getByRole('button', { name: 'Record again' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(startBtn()).toBeInTheDocument()
  })
})

describe('PracticeSession leave confirmation', () => {
  async function recording() {
    const s = setup()
    await s.user.click(startBtn())
    await stopBtn()
    return s
  }

  it('Cancel take opens the dialog; Keep recording stays recording', async () => {
    const s = await recording()
    await s.user.click(screen.getByRole('button', { name: 'Cancel take' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Stop and discard this recording?' })
    await s.user.click(within(dialog).getByRole('button', { name: 'Keep recording' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await stopBtn()).toBeInTheDocument()
    expect(s.stop).not.toHaveBeenCalled()
  })

  it('Stop & review goes to review', async () => {
    const s = await recording()
    await s.user.click(screen.getByRole('button', { name: 'Cancel take' }))
    await s.user.click(screen.getByRole('button', { name: 'Stop & review' }))
    expect(await screen.findByRole('button', { name: 'Transcribe' })).toBeInTheDocument()
  })

  it('Discard returns to ready and stops the recorder', async () => {
    const s = await recording()
    await s.user.click(screen.getByRole('button', { name: 'Cancel take' }))
    await s.user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(startBtn()).toBeInTheDocument())
    expect(s.stop).toHaveBeenCalledTimes(1)
  })

  it('closes the recording dialog when the recording stops by itself, keeping the take', async () => {
    const s = await recording()
    await s.user.click(screen.getByRole('button', { name: 'Cancel take' }))
    expect(screen.getByRole('alertdialog', { name: 'Stop and discard this recording?' })).toBeInTheDocument()

    act(() => s.autoStop()(audio(), 'limit'))

    expect(await screen.findByText('Stopped at the 10-minute limit')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog', { name: 'Stop and discard this recording?' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transcribe' })).toBeInTheDocument()
  })

  it('an in-app navigate() asks first, and Discard then completes the navigation', async () => {
    const s = await recording()
    act(() => navigate('/'))
    expect(window.location.pathname).toBe('/practice/q1')
    expect(screen.getByRole('alertdialog', { name: 'Stop and discard this recording?' })).toBeInTheDocument()
    await s.user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(s.stop).toHaveBeenCalled()
  })
})

describe('PracticeSession question snapshot (E17)', () => {
  it('keeps the original question text and file name when the prop changes', async () => {
    const s = setup()
    s.rerender(<PracticeSession {...s.props({ ...practice, question: { ...question, text: 'Something else entirely' } })} />)
    expect(screen.getByRole('heading', { name: 'Tell me about yourself.' })).toBeInTheDocument()
    await record(s)
    expect(screen.getByRole('link', { name: '⬇ Audio' })).toHaveAttribute(
      'download',
      'tell-me-about-yourself-20261019-140509.webm',
    )
  })
})

describe('PracticeSession saved takes', () => {
  async function transcribed(take_id?: string | null) {
    const s = setup({ transcribe: () => Promise.resolve(take_id === undefined ? transcript : { ...transcript, take_id }) })
    await record(s)
    await s.user.click(screen.getByRole('button', { name: 'Transcribe' }))
    await screen.findByText('How it went')
    return s
  }

  it('lists the past takes of this question on the ready screen', async () => {
    const s = setup()
    expect(await screen.findByRole('heading', { name: 'Past takes' })).toBeInTheDocument()
    expect(s.takes.list).toHaveBeenCalledWith('q1', expect.any(AbortSignal))
  })

  it('transcribes for this question, so the server saves the take', async () => {
    const s = await transcribed('t1')
    expect(s.transcribe).toHaveBeenCalledWith(expect.any(Blob), 'q1')
  })

  it('says the take was saved', async () => {
    await transcribed('t1')
    expect(screen.getByText('Saved to your past takes.')).toBeInTheDocument()
  })

  it('warns when the take could not be saved', async () => {
    await transcribed(null)
    expect(screen.getByRole('alert')).toHaveTextContent("This take couldn't be saved")
    expect(screen.queryByText('Saved to your past takes.')).not.toBeInTheDocument()
  })

  it('leaving a saved take warns only about the recording', async () => {
    const s = await transcribed('t1')
    await s.user.click(screen.getByRole('button', { name: 'Practise again' }))
    expect(within(screen.getByRole('alertdialog')).getByText(/transcript is saved in your past takes/)).toBeInTheDocument()
  })

  it('leaving an unsaved take still warns that nothing is stored', async () => {
    const s = await transcribed(null)
    await s.user.click(screen.getByRole('button', { name: 'Practise again' }))
    expect(within(screen.getByRole('alertdialog')).getByText(/aren't stored anywhere/)).toBeInTheDocument()
  })
})

describe('PracticeSession out of practice time', () => {
  afterEach(() => resetAccount())

  it('offers to buy time, then Try again on the same recording', async () => {
    setAccount({ metered: true, free_transcriptions_left: 0, seconds_left: 0, packs: [] })
    const transcribe = vi.fn().mockRejectedValueOnce(new ApiError('x', 402, 'payment_required')).mockResolvedValue(transcript)
    const s = setup({ transcribe })
    await record(s)
    await s.user.click(screen.getByRole('button', { name: 'Transcribe' }))

    expect(await screen.findByText("You're out of practice time")).toBeInTheDocument()
    await s.user.click(screen.getByRole('button', { name: 'Buy practice time' }))
    expect(within(screen.getByRole('alertdialog')).getByText('Buy practice time')).toBeInTheDocument()
    await s.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Not now' }))

    await s.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('How it went')).toBeInTheDocument()
    expect(transcribe).toHaveBeenCalledTimes(2)
  })
})
