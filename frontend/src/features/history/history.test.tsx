import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as questionsApi from '@/features/questions/api/questionsApi'
import type { Question } from '@/features/questions'
import * as takesModule from '@/features/takes/api/takesApi'
import type { Take, TakeSummary, TakesApi } from '@/features/takes'
import { ApiError } from '@/shared/api/client'
import { HistoryScreen, QuestionProgressScreen, TakeScreen } from '.'

vi.mock('@/features/questions/api/questionsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof questionsApi>()),
  listQuestions: vi.fn(),
}))
vi.mock('@/features/takes/api/takesApi', async (importOriginal) => ({
  ...(await importOriginal<typeof takesModule>()),
  listAllTakes: vi.fn(),
}))
const listQuestions = vi.mocked(questionsApi.listQuestions)
const listAllTakes = vi.mocked(takesModule.listAllTakes)

const NOW = new Date(2026, 9, 30, 15)
const at = (d: number, h = 12) => new Date(2026, 9, d, h).toISOString()
const questions = [
  { id: 'q1', text: 'Tell me about yourself.', created_at: at(1) },
  { id: 'q2', text: 'Why this role?', created_at: at(1) },
] as Question[]
const summary = (fpm: number | null, wpm = 140) => ({
  word_count: 100,
  filler_count: 2,
  fillers: [],
  words_per_minute: wpm,
  fillers_per_minute: fpm,
  pause_count: 0,
  longest_pause_seconds: null,
})
const take = (id: string, question_id: string, created_at: string, fpm: number | null): TakeSummary => ({
  id,
  question_id,
  created_at,
  duration_seconds: 72,
  summary: summary(fpm),
})
const takes = [take('t3', 'q1', at(30, 9), 1.4), take('t2', 'q2', at(27), 3.1), take('t1', 'q1', at(10), 3.8)]

beforeEach(() => {
  listQuestions.mockResolvedValue(questions)
  listAllTakes.mockImplementation(async (filter = {}) =>
    filter.limit === 1 ? takes.slice(0, 1) : takes.filter((t) => !filter.questionId || t.question_id === filter.questionId),
  )
})

describe('HistoryScreen', () => {
  it('groups takes by day, names their questions and links each to its take', async () => {
    render(<HistoryScreen now={NOW} />)
    const today = await screen.findByRole('group', { name: 'Today' })
    expect(within(today).getByRole('link', { name: /Tell me about yourself\./ })).toHaveAttribute('href', '/takes/t3')
    expect(within(screen.getByRole('group', { name: 'This week' })).getByText('Why this role?')).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Earlier' })).getByText('3.8 / min')).toBeInTheDocument()
    // q1's better take is marked best; q2 has only one take, so nothing to beat.
    expect(within(today).getByText('1.4 / min · best')).toBeInTheDocument()
  })

  it('asks for the last 30 days by default, and everything with All', async () => {
    const user = userEvent.setup()
    render(<HistoryScreen now={NOW} />)
    await screen.findByRole('group', { name: 'Today' })
    expect(listAllTakes).toHaveBeenCalledWith({ questionId: undefined, since: new Date(2026, 9, 1).toISOString() }, expect.anything())
    await user.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(listAllTakes).toHaveBeenCalledWith({ questionId: undefined, since: undefined }, expect.anything()))
  })

  it('filters by question and links to its progress', async () => {
    const user = userEvent.setup()
    render(<HistoryScreen now={NOW} />)
    await screen.findByRole('option', { name: 'Why this role?' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Question' }), 'q2')
    expect(await screen.findByRole('link', { name: 'See progress for “Why this role?” →' })).toHaveAttribute('href', '/history/q2')
    await waitFor(() => expect(screen.queryByText('Tell me about yourself.', { selector: '.ui-row__title' })).toBeNull())
  })

  it('shows the empty state before the first take', async () => {
    listAllTakes.mockResolvedValue([])
    render(<HistoryScreen now={NOW} />)
    expect(await screen.findByText('No takes yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Practise a question' })).toHaveAttribute('href', '/questions')
  })
})

describe('QuestionProgressScreen', () => {
  it('shows first, latest (with the change), best and pace, a chart and the takes', async () => {
    render(<QuestionProgressScreen questionId="q1" now={NOW} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell me about yourself.' })).toBeInTheDocument()
    expect(await screen.findByText('↓ 63% since first')).toBeInTheDocument()
    expect(screen.getByText('3.8')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /from 3\.8 on the first to 1\.4 on the latest/ })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /\/ min/ })).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Practise again' })).toHaveAttribute('href', '/practice/q1')
  })

  it('says a deleted question is gone', async () => {
    render(<QuestionProgressScreen questionId="gone" now={NOW} />)
    expect(await screen.findByRole('heading', { name: "That question doesn't exist any more" })).toBeInTheDocument()
  })
})

describe('TakeScreen', () => {
  const full: Take = {
    ...takes[0],
    transcript: {
      text: 'Hello um world',
      words: [
        { word: 'hello', punctuated_word: 'Hello', start: 0, end: 0.3, confidence: 0.9, is_filler: false, pause_before_seconds: 0 },
        { word: 'um', punctuated_word: 'um', start: 0.4, end: 0.6, confidence: 0.9, is_filler: true, pause_before_seconds: 0 },
        { word: 'world', punctuated_word: 'world', start: 0.7, end: 1, confidence: 0.9, is_filler: false, pause_before_seconds: 0 },
      ],
      duration_seconds: 72,
      summary: summary(1.4),
    },
  } as Take
  const api = (overrides: Partial<TakesApi> = {}): TakesApi => ({
    list: vi.fn(),
    get: vi.fn().mockResolvedValue(full),
    remove: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  it('shows the question, the summary and the highlighted transcript', async () => {
    render(<TakeScreen takeId="t3" api={api()} />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Tell me about yourself.' })).toBeInTheDocument()
    expect(screen.getByText('Pace')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Transcript text' })).toHaveTextContent('Hello um world')
    expect(screen.getByRole('link', { name: 'Download transcript (.txt)' })).toBeInTheDocument()
  })

  it('deletes after confirming, then goes to the question’s progress', async () => {
    const user = userEvent.setup()
    const takesApi = api()
    window.history.pushState(null, '', '/takes/t3')
    render(<TakeScreen takeId="t3" api={takesApi} />)
    await user.click(await screen.findByRole('button', { name: 'Delete take' }))
    await user.click(within(screen.getByRole('alertdialog', { name: 'Delete this take?' })).getByRole('button', { name: 'Delete' }))
    expect(takesApi.remove).toHaveBeenCalledWith('t3')
    await waitFor(() => expect(window.location.pathname).toBe('/history/q1'))
  })

  it('says when the take no longer exists', async () => {
    render(<TakeScreen takeId="gone" api={api({ get: vi.fn().mockRejectedValue(new ApiError('gone', 404, 'take_not_found')) })} />)
    expect(await screen.findByRole('heading', { name: "That take doesn't exist any more" })).toBeInTheDocument()
  })
})
