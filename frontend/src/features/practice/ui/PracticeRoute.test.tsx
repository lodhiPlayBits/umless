import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/client'
import * as api from '../api/practiceApi'
import type { PracticeQuestion } from '../api/practiceApi'
import PracticeRoute from './PracticeRoute'

vi.mock('../api/practiceApi', () => ({ loadPracticeQuestion: vi.fn(), isServerUp: vi.fn() }))
// The session has its own tests; here it only shows what the route handed it.
vi.mock('./PracticeSession', () => ({
  default: ({ practice, serverUp }: { practice: PracticeQuestion; serverUp: boolean | null }) => (
    <p>
      session {practice.question.text} serverUp={String(serverUp)}
    </p>
  ),
}))

const mocked = vi.mocked(api)
const practice: PracticeQuestion = { question: { id: 'a', text: 'Why this role?', created_at: '2026-10-20T00:00:00Z' }, number: 1, total: 1, nextId: null }

/** Like the real client: never answers, and rejects as unreachable once the signal aborts. */
function hang<T>(signal?: AbortSignal) {
  return new Promise<T>((_, reject) => {
    signal?.addEventListener('abort', () => reject(new ApiError('Could not reach the server', 0)))
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocked.isServerUp.mockResolvedValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PracticeRoute', () => {
  it('shows Loading… and then the session', async () => {
    mocked.loadPracticeQuestion.mockResolvedValue(practice)
    render(<PracticeRoute questionId="a" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(await screen.findByText(/session Why this role\? serverUp=true/)).toBeInTheDocument()
  })

  it('shows not-found for an unknown question (E16)', async () => {
    mocked.loadPracticeQuestion.mockResolvedValue(null)
    render(<PracticeRoute questionId="zzz" />)
    expect(await screen.findByRole('heading', { name: "That question doesn't exist any more" })).toBeInTheDocument()
  })

  it('shows the unreachable banner, and Retry loads again', async () => {
    mocked.loadPracticeQuestion.mockRejectedValueOnce(new ApiError('Could not reach the server', 0))
    const user = userEvent.setup()
    render(<PracticeRoute questionId="a" />)
    expect(await screen.findByText("Can't reach the umless server")).toBeInTheDocument()

    mocked.loadPracticeQuestion.mockResolvedValue(practice)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(/session Why this role\?/)).toBeInTheDocument()
    expect(mocked.loadPracticeQuestion).toHaveBeenCalledTimes(2)
  })

  it('does not blame the backend being down when it answered with an error code', async () => {
    mocked.loadPracticeQuestion.mockRejectedValue(new ApiError('Questions file is unreadable', 500, 'internal_error'))
    render(<PracticeRoute questionId="a" />)
    expect(await screen.findByText("Couldn't load this question")).toBeInTheDocument()
    expect(screen.getByText('Questions file is unreadable')).toBeInTheDocument()
    expect(screen.queryByText("Can't reach the umless server")).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})

describe('PracticeRoute when the backend hangs', () => {
  it('gives up after 10 s and shows the unreachable banner', async () => {
    vi.useFakeTimers()
    mocked.loadPracticeQuestion.mockImplementation((_id, signal) => hang(signal))
    render(<PracticeRoute questionId="a" />)
    await act(() => vi.advanceTimersByTimeAsync(9_999))
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(screen.getByText("Can't reach the umless server")).toBeInTheDocument()
  })

  it('treats a health check that never answers as offline', async () => {
    vi.useFakeTimers()
    mocked.loadPracticeQuestion.mockResolvedValue(practice)
    mocked.isServerUp.mockImplementation((signal) => hang<boolean>(signal).catch(() => false))
    render(<PracticeRoute questionId="a" />)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(screen.getByText(/serverUp=null/)).toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(10_001))
    expect(screen.getByText(/serverUp=false/)).toBeInTheDocument()
  })

  it('aborts the requests when the page is left', async () => {
    mocked.loadPracticeQuestion.mockImplementation((_id, signal) => hang(signal))
    const { unmount } = render(<PracticeRoute questionId="a" />)
    const signal = mocked.loadPracticeQuestion.mock.calls[0][1]
    expect(signal?.aborted).toBe(false)
    unmount()
    expect(signal?.aborted).toBe(true)
    expect(mocked.isServerUp.mock.calls[0][0]?.aborted).toBe(true)
  })

  it('aborts the previous attempt when Retry is pressed', async () => {
    mocked.loadPracticeQuestion.mockRejectedValueOnce(new ApiError('Could not reach the server', 0))
    mocked.isServerUp.mockImplementation((signal) => hang<boolean>(signal).catch(() => false))
    const user = userEvent.setup()
    render(<PracticeRoute questionId="a" />)
    await screen.findByText("Can't reach the umless server")
    const firstHealthCheck = mocked.isServerUp.mock.calls[0][0]
    expect(firstHealthCheck?.aborted).toBe(false)

    mocked.loadPracticeQuestion.mockResolvedValue(practice)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(firstHealthCheck?.aborted).toBe(true)
  })
})
