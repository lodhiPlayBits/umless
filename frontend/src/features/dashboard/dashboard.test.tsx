import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as questionsApi from '@/features/questions/api/questionsApi'
import type { Question } from '@/features/questions'
import * as takesModule from '@/features/takes/api/takesApi'
import type { TakeSummary } from '@/features/takes'
import { ApiError } from '@/shared/api/client'
import { DashboardScreen } from '.'

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
const at = (d: number) => new Date(2026, 9, d, 12).toISOString()
const q = (id: string, text: string) => ({ id, text, created_at: at(1) }) as Question
const take = (id: string, question_id: string, day: number, fpm: number, wpm = 140, pause: number | null = 2): TakeSummary => ({
  id,
  question_id,
  created_at: at(day),
  duration_seconds: 70,
  summary: { word_count: 100, filler_count: 2, fillers: [], words_per_minute: wpm, fillers_per_minute: fpm, pause_count: 1, longest_pause_seconds: pause },
})

function serve(questions: Question[], takes: TakeSummary[]) {
  listQuestions.mockResolvedValue(questions)
  listAllTakes.mockImplementation(async (filter = {}) => (filter.limit === 1 ? takes.slice(0, 1) : takes))
}

beforeEach(() => vi.resetAllMocks())

describe('DashboardScreen, first visit', () => {
  it('without questions: the checklist at 0 of 3, and a field to add one', async () => {
    serve([], [])
    render(<DashboardScreen now={NOW} />)
    expect(await screen.findByRole('heading', { name: 'Welcome to umless' })).toBeInTheDocument()
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument()
    expect(screen.getByLabelText('New question')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Tell me about yourself.' })).toBeInTheDocument()
  })

  it('with a question but no take: step 1 is done and the next step is to record it', async () => {
    serve([q('q1', 'Tell me about yourself.')], [])
    render(<DashboardScreen now={NOW} />)
    expect(await screen.findByText('1 of 3 done')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Record your first answer' })).toHaveAttribute('href', '/practice/q1')
  })
})

describe('DashboardScreen, returning', () => {
  const questions = [q('q1', 'Tell me about yourself.'), q('q2', 'Tell me about a time you failed.'), q('q3', 'Why this role?')]
  // This week: 3 takes (30, 29, 28 → a 3-day streak). Last week: 1 take. q2 never practised.
  const takes = [
    take('t5', 'q1', 30, 1.4, 146, 1.5),
    take('t4', 'q3', 29, 1.8, 138, 2.5),
    take('t3', 'q1', 28, 2.4, 150, 2.0),
    take('t2', 'q1', 20, 3.0, 132, 3.0),
    take('t1', 'q3', 5, 4.2, 120, 4.0),
  ]

  it('shows the streak and suggests the question not tried yet', async () => {
    serve(questions, takes)
    render(<DashboardScreen now={NOW} />)
    expect(await screen.findByText('3 days in a row. Keep it going.')).toBeInTheDocument()
    const next = screen.getByRole('region', { name: 'Tell me about a time you failed.' })
    expect(within(next).getByText('Practise next · not tried yet')).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Start practising' })).toHaveAttribute('href', '/practice/q2')
  })

  it('compares this week with last week', async () => {
    serve(questions, takes)
    render(<DashboardScreen now={NOW} />)
    await screen.findByText('Takes this week')
    expect(screen.getByText('↑ 2 vs last week')).toBeInTheDocument() // 3 takes vs 1
    expect(screen.getByText('1.9')).toBeInTheDocument() // (1.4 + 1.8 + 2.4) / 3
    expect(screen.getByText('↓ 1.1 vs last week')).toBeInTheDocument() // 1.9 vs 3.0
    expect(screen.getByText('In the 130–160 range')).toBeInTheDocument() // 144.7 wpm
    expect(screen.getByText('↓ 1.0 s vs last week')).toBeInTheDocument() // 2.0 s vs 3.0 s
  })

  it('draws the weekly trend and lists recent takes linking to them', async () => {
    serve(questions, takes)
    render(<DashboardScreen now={NOW} />)
    expect(await screen.findByRole('img', { name: /Fillers per minute by week\. Down from 4\.2 to 1\.9/ })).toBeInTheDocument()
    const recent = screen.getByRole('region', { name: 'Recent takes' })
    expect(within(recent).getAllByRole('link', { name: /\/ min/ })).toHaveLength(4)
    expect(within(recent).getAllByRole('link', { name: /\/ min/ })[0]).toHaveAttribute('href', '/takes/t5')
    expect(within(recent).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/history')
  })

  it('suggests the question practised longest ago once all have been tried', async () => {
    serve(questions.filter((x) => x.id !== 'q2'), takes)
    render(<DashboardScreen now={NOW} />)
    expect(await screen.findByText('Practise next · last practised yesterday')).toBeInTheDocument()
  })
})

describe('DashboardScreen, errors', () => {
  it('shows one banner with Retry when something fails to load', async () => {
    listQuestions.mockRejectedValue(new ApiError('Could not reach the server', 0))
    listAllTakes.mockResolvedValue([])
    render(<DashboardScreen now={NOW} />)
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
