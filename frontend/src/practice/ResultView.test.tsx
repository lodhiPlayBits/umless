import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recording } from '../recorder'
import { navigate } from '../router'
import PracticeSession from './PracticeSession'
import type { Transcript } from './practiceApi'

const question = { id: 'q1', text: 'Tell me about yourself.', created_at: '2026-01-01T00:00:00Z' }
const practice = { question, number: 2, total: 3, nextId: 'q2' as string | null }
const recording: Recording = {
  blob: new Blob(['aaa'], { type: 'audio/webm' }),
  mimeType: 'audio/webm',
  durationMs: 65_000,
}
const w = (text: string, start: number, end: number, is_filler = false) => ({
  word: text.toLowerCase(),
  punctuated_word: text,
  start,
  end,
  confidence: 0.9,
  is_filler,
  pause_before_seconds: 0,
})
const transcript: Transcript = {
  text: 'So um I think good end',
  words: [w('So', 0, 0.3), w('um', 0.3, 0.5, true), w('I', 0.5, 0.7), w('think', 0.7, 1), w('good', 3.5, 4), w('end', 4.996, 5)],
  duration_seconds: 72,
  summary: {
    word_count: 6,
    filler_count: 1,
    fillers: [{ word: 'um', count: 1 }],
    words_per_minute: 138,
    fillers_per_minute: 0.8,
    pause_count: 1,
    longest_pause_seconds: 2.5,
  },
}
const emptyTranscript: Transcript = {
  text: '',
  words: [],
  duration_seconds: 2,
  summary: {
    word_count: 0,
    filler_count: 0,
    fillers: [],
    words_per_minute: null,
    fillers_per_minute: null,
    pause_count: 0,
    longest_pause_seconds: null,
  },
}
const g = globalThis as Record<string, unknown>
let originalMediaRecorder: unknown
let originalMediaDevices: PropertyDescriptor | undefined

beforeEach(() => {
  originalMediaRecorder = g.MediaRecorder
  originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  g.MediaRecorder = class {}
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() }, configurable: true })
  window.history.pushState(null, '', '/practice/q1')
})

afterEach(() => {
  g.MediaRecorder = originalMediaRecorder
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else delete (navigator as unknown as Record<string, unknown>).mediaDevices
  window.history.pushState(null, '', '/')
})

function renderSession(t: Transcript, p = practice) {
  const handle = { mimeType: recording.mimeType, stop: vi.fn().mockResolvedValue(recording), level: () => 0.5 }
  render(
    <PracticeSession
      practice={p}
      serverUp
      startRecording={(() => Promise.resolve(handle)) as never}
      transcribe={() => Promise.resolve(t)}
      now={() => new Date(2026, 9, 19, 14, 5, 9)}
    />,
  )
  return userEvent.setup()
}

async function toReview(t: Transcript = transcript, p = practice) {
  const user = renderSession(t, p)
  await user.click(screen.getByRole('button', { name: 'Start recording' }))
  await user.click(await screen.findByRole('button', { name: 'Stop recording' }))
  await screen.findByRole('button', { name: 'Transcribe' })
  return user
}

async function toResult(t: Transcript = transcript, p = practice) {
  const user = await toReview(t, p)
  await user.click(screen.getByRole('button', { name: 'Transcribe' }))
  await screen.findByRole('heading', { name: 'Transcript' })
  return user
}

/** jsdom can't follow a blob download; swallow the click's default action. */
function stubDownload(link: HTMLElement) {
  link.addEventListener('click', (e) => e.preventDefault())
  return link
}

const dialog = () => screen.queryByRole('alertdialog', { name: 'Leave without saving?' })

describe('result screen', () => {
  it('shows the summary, transcript, downloads, Copy, Practise again and Next question', async () => {
    await toResult()
    expect(screen.getByText('How it went')).toBeInTheDocument()
    expect(screen.getByText('Length').nextElementSibling).toHaveTextContent('1:12')
    expect(screen.getByLabelText('Transcript text')).toHaveTextContent('So um I think')
    expect(screen.getByRole('link', { name: '⬇ Download transcript (.txt)' })).toHaveAttribute(
      'download',
      'tell-me-about-yourself-20261019-140509.txt',
    )
    expect(screen.getByRole('link', { name: '⬇ Download audio (.webm)' })).toHaveAttribute(
      'download',
      'tell-me-about-yourself-20261019-140509.webm',
    )
    expect(screen.getByRole('button', { name: /Copy transcript/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Practise again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Next question →' })).toHaveAttribute('href', '/practice/q2')
  })

  it('hides Next question on the last question', async () => {
    await toResult(transcript, { ...practice, number: 3, nextId: null })
    expect(screen.queryByRole('link', { name: /Next question/ })).not.toBeInTheDocument()
  })

  it('highlights fillers as <mark> and shows dots with an accessible label for whole-second gaps only', async () => {
    await toResult()
    const body = screen.getByLabelText('Transcript text')
    const marks = body.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]).toHaveTextContent('um')
    // think ends 1.0, good starts 3.5: 2 dots. good ends 4.0, end starts 4.996: none.
    const pauses = within(body).getAllByRole('img')
    expect(pauses).toHaveLength(1)
    expect(pauses[0]).toHaveAccessibleName('2 second pause')
    expect(pauses[0]).toHaveTextContent('..')
  })

  it('Copy transcript copies the text and shows "Copied to clipboard"', async () => {
    const user = await toResult()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await user.click(screen.getByRole('button', { name: /Copy transcript/ }))
    expect(writeText).toHaveBeenCalledWith(transcript.text)
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument()
  })

  it('shows "Select and copy the text instead" when the clipboard rejects', async () => {
    const user = await toResult()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    })
    await user.click(screen.getByRole('button', { name: /Copy transcript/ }))
    expect(await screen.findByText('Select and copy the text instead')).toBeInTheDocument()
  })
})

describe('result-empty (E12)', () => {
  it('shows the no-words message with Practise again and audio download, and no summary', async () => {
    const user = await toReview(emptyTranscript)
    await user.click(screen.getByRole('button', { name: 'Transcribe' }))
    expect(await screen.findByText("We couldn't hear any words")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Practise again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Download audio/ })).toBeInTheDocument()
    expect(screen.queryByText('How it went')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Download transcript/ })).not.toBeInTheDocument()
  })
})

describe('leave without saving (E14)', () => {
  it('on the result, navigate asks first; Stay keeps the page', async () => {
    const user = await toResult()
    act(() => navigate('/'))
    const d = dialog()!
    expect(d).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Stay' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: '⬇ Download audio' })).toBeInTheDocument()
    await user.click(within(d).getByRole('button', { name: 'Stay' }))
    expect(dialog()).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/practice/q1')
    expect(screen.getByText('How it went')).toBeInTheDocument()
  })

  it('Leave completes the navigation', async () => {
    const user = await toResult()
    act(() => navigate('/'))
    await user.click(within(dialog()!).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('goes straight through after the transcript was downloaded', async () => {
    const user = await toResult()
    await user.click(stubDownload(screen.getByRole('link', { name: '⬇ Download transcript (.txt)' })))
    act(() => navigate('/'))
    expect(dialog()).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('goes straight through after the audio was downloaded', async () => {
    const user = await toResult()
    await user.click(stubDownload(screen.getByRole('link', { name: '⬇ Download audio (.webm)' })))
    act(() => navigate('/'))
    expect(dialog()).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/')
  })

  it('also asks on the review screen, before transcribing', async () => {
    const user = await toReview()
    act(() => navigate('/'))
    expect(dialog()).toBeInTheDocument()
    expect(window.location.pathname).toBe('/practice/q1')
    await user.click(within(dialog()!).getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('Practise again with nothing downloaded asks, and Leave returns to the ready screen', async () => {
    const user = await toResult()
    await user.click(screen.getByRole('button', { name: 'Practise again' }))
    expect(dialog()).toBeInTheDocument()
    await user.click(within(dialog()!).getByRole('button', { name: 'Leave' }))
    expect(await screen.findByRole('button', { name: 'Start recording' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/practice/q1')
  })

  it('Practise again with Stay keeps the result', async () => {
    const user = await toResult()
    await user.click(screen.getByRole('button', { name: 'Practise again' }))
    await user.click(within(dialog()!).getByRole('button', { name: 'Stay' }))
    expect(screen.getByText('How it went')).toBeInTheDocument()
  })

  it('Practise again goes straight to ready once something was downloaded', async () => {
    const user = await toResult()
    await user.click(stubDownload(screen.getByRole('link', { name: '⬇ Download transcript (.txt)' })))
    await user.click(screen.getByRole('button', { name: 'Practise again' }))
    expect(dialog()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start recording' })).toBeInTheDocument()
  })

  it('Download audio in the dialog counts as downloaded, so navigation then goes through', async () => {
    const user = await toResult()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    act(() => navigate('/'))
    await user.click(within(dialog()!).getByRole('button', { name: '⬇ Download audio' }))
    expect(click).toHaveBeenCalledTimes(1)
    click.mockRestore()
    expect(dialog()).not.toBeInTheDocument()
    act(() => navigate('/'))
    expect(window.location.pathname).toBe('/')
  })
})
