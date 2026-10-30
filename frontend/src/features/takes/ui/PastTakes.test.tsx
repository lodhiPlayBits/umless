import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/client'
import PastTakes from './PastTakes'
import { invalidateTakes } from '../model/useTakes'
import type { Take, TakeSummary, TakesApi } from '../api/takesApi'
import { takeDate, takeStats } from '../model/takesText'

const summary = {
  word_count: 3,
  filler_count: 1,
  fillers: [{ word: 'um' as const, count: 1 }],
  words_per_minute: 132,
  fillers_per_minute: 2.4,
  pause_count: 0,
  longest_pause_seconds: null,
}
const older: TakeSummary = { id: 't1', question_id: 'q1', created_at: '2026-10-24T09:00:00Z', duration_seconds: 65, summary }
const newer: TakeSummary = { ...older, id: 't2', created_at: '2026-10-25T10:30:00Z' }
const word = (w: string, start: number, is_filler = false) => ({
  word: w.toLowerCase(),
  punctuated_word: w,
  start,
  end: start + 0.3,
  confidence: 0.9,
  is_filler,
  pause_before_seconds: 0,
})
const fullTake = (summaryTake: TakeSummary): Take => ({
  ...summaryTake,
  transcript: {
    text: 'Hello um world',
    words: [word('Hello', 0), word('um', 0.3, true), word('world', 0.6)],
    duration_seconds: 65,
    summary,
  },
})

function setup(api: Partial<TakesApi> = {}) {
  const takes: TakesApi = {
    list: vi.fn().mockResolvedValue([newer, older]),
    get: vi.fn(async (id: string) => fullTake(id === 't2' ? newer : older)),
    remove: vi.fn().mockResolvedValue(undefined),
    ...api,
  }
  render(<PastTakes questionId="q1" question="Tell me about yourself." api={takes} />)
  return { takes, user: userEvent.setup() }
}

const rows = () => screen.getAllByRole('listitem')

describe('PastTakes', () => {
  it('lists the takes newest first with their date and stats', async () => {
    setup()
    await screen.findByText(takeDate(newer))
    expect(rows()).toHaveLength(2)
    expect(within(rows()[0]).getByText(takeDate(newer))).toBeInTheDocument()
    expect(within(rows()[0]).getByText('1:05 · 132 wpm · 2.4 fillers/min')).toBeInTheDocument()
  })

  it('says when there are no takes yet', async () => {
    setup({ list: vi.fn().mockResolvedValue([]) })
    expect(await screen.findByText(/No saved takes yet/)).toBeInTheDocument()
  })

  it('offers Retry when the list fails to load', async () => {
    const list = vi.fn().mockRejectedValueOnce(new ApiError('x', 503)).mockResolvedValue([older])
    const s = setup({ list })
    await s.user.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(takeDate(older))).toBeInTheDocument()
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('shows a take’s highlighted transcript and a .txt download, and hides it again', async () => {
    const s = setup()
    const show = await screen.findAllByRole('button', { name: 'Show transcript' })
    await s.user.click(show[0])

    const text = await screen.findByRole('region', { name: 'Transcript text' })
    expect(within(text).getByText('um', { selector: 'mark' })).toBeInTheDocument()
    expect(s.takes.get).toHaveBeenCalledWith('t2')
    expect(screen.getByRole('link', { name: /Download transcript/ })).toHaveAttribute(
      'download',
      expect.stringMatching(/^tell-me-about-yourself-\d{8}-\d{6}\.txt$/),
    )

    await s.user.click(screen.getByRole('button', { name: 'Hide transcript' }))
    expect(screen.queryByRole('region', { name: 'Transcript text' })).not.toBeInTheDocument()
  })

  it('says so when a take can’t be opened', async () => {
    const s = setup({ get: vi.fn().mockRejectedValue(new ApiError('x', 503, 'storage_unavailable')) })
    await s.user.click((await screen.findAllByRole('button', { name: 'Show transcript' }))[0])
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't open this take")
  })

  it('deletes a take after confirming', async () => {
    const s = setup()
    await s.user.click(await screen.findByRole('button', { name: `Delete take from ${takeDate(newer)}` }))
    await s.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    expect(s.takes.remove).toHaveBeenCalledWith('t2')
    await waitFor(() => expect(rows()).toHaveLength(1))
    expect(screen.queryByText(takeDate(newer))).not.toBeInTheDocument()
  })

  it('keeps the take when deleting is cancelled', async () => {
    const s = setup()
    await s.user.click(await screen.findByRole('button', { name: `Delete take from ${takeDate(newer)}` }))
    await s.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    expect(s.takes.remove).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(2)
  })

  it('keeps the take and says so when deleting fails', async () => {
    const s = setup({ remove: vi.fn().mockRejectedValue(new ApiError('x', 503, 'storage_unavailable')) })
    await s.user.click(await screen.findByRole('button', { name: `Delete take from ${takeDate(newer)}` }))
    await s.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't delete that take")
    expect(rows()).toHaveLength(2)
  })

  it('treats a take that is already gone as deleted', async () => {
    const s = setup({ remove: vi.fn().mockRejectedValue(new ApiError('x', 404, 'take_not_found')) })
    await s.user.click(await screen.findByRole('button', { name: `Delete take from ${takeDate(newer)}` }))
    await s.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(rows()).toHaveLength(1))
  })
})

describe('PastTakes cache', () => {
  it('reloads when a new take is saved (invalidateTakes after a transcription)', async () => {
    const latest: TakeSummary = { ...older, id: 't3', created_at: '2026-10-26T08:00:00Z' }
    const list = vi.fn().mockResolvedValueOnce([newer, older]).mockResolvedValueOnce([latest, newer, older])
    setup({ list })
    await waitFor(() => expect(rows()).toHaveLength(2))
    await act(() => invalidateTakes())
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('takeStats', () => {
  it('leaves out values the server could not compute', () => {
    const blank = { ...older, duration_seconds: null, summary: { ...summary, words_per_minute: null, fillers_per_minute: null } }
    expect(takeStats(blank)).toBe('')
  })
})
