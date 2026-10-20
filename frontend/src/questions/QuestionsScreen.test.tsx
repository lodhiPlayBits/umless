import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../client'
import QuestionsScreen from './QuestionsScreen'
import * as api from './questionsApi'
import type { Question } from './questionText'

vi.mock('./questionsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./questionsApi')>()
  return {
    ...actual, // keep the pure saveErrorMessage
    listQuestions: vi.fn(),
    createQuestion: vi.fn(),
    updateQuestion: vi.fn(),
    deleteQuestion: vi.fn(),
  }
})

const mocked = vi.mocked(api)
const q = (id: string, text: string) => ({ id, text }) as Question
const three = [q('a', 'Tell me about yourself.'), q('b', 'Why this role?'), q('c', 'Biggest weakness?')]
const unreachable = () => new ApiError('Could not reach the server', 0)

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderScreen(questions: Question[] = three) {
  mocked.listQuestions.mockResolvedValue(questions)
  const user = userEvent.setup()
  render(<QuestionsScreen />)
  await waitFor(() => expect(screen.getByLabelText('New question')).toBeEnabled())
  return user
}

const field = () => screen.getByLabelText('New question')
const addButton = () => screen.getByRole('button', { name: /^Add/ })

describe('QuestionsScreen list', () => {
  it('shows each question with its number and the count', async () => {
    await renderScreen()
    expect(screen.getByText('3 questions')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('2')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Why this role?')).toBeInTheDocument()
  })

  it('gives each row Edit, Delete and a Practise link to /practice/<id>', async () => {
    await renderScreen()
    expect(screen.getByRole('button', { name: 'Edit question 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete question 2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Practise.*question 2/ })).toHaveAttribute('href', '/practice/b')
  })
})

describe('QuestionsScreen empty state', () => {
  it('shows the first-visit intro and three suggestion chips', async () => {
    await renderScreen([])
    expect(screen.getByText('No questions yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^\+ / })).toHaveLength(3)
  })

  it('creates the question when a chip is clicked', async () => {
    const user = await renderScreen([])
    mocked.createQuestion.mockResolvedValue(q('n', 'Tell me about yourself.'))
    await user.click(screen.getByRole('button', { name: '+ Tell me about yourself.' }))
    expect(mocked.createQuestion).toHaveBeenCalledWith('Tell me about yourself.')
    expect(await screen.findByText('1 question')).toBeInTheDocument()
  })
})

describe('QuestionsScreen loading', () => {
  it('shows the unreachable error with Retry and a disabled field, and Retry loads again', async () => {
    mocked.listQuestions.mockRejectedValueOnce(unreachable())
    const user = userEvent.setup()
    render(<QuestionsScreen />)
    expect(await screen.findByText("Can't reach the umless server")).toBeInTheDocument()
    expect(field()).toBeDisabled()

    mocked.listQuestions.mockResolvedValue(three)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('3 questions')).toBeInTheDocument()
    expect(mocked.listQuestions).toHaveBeenCalledTimes(2)
    expect(screen.queryByText("Can't reach the umless server")).toBeNull()
  })

  it("shows the backend's own message when it answered with an error code", async () => {
    mocked.listQuestions.mockRejectedValue(new ApiError('Questions file is unreadable', 500, 'internal_error'))
    render(<QuestionsScreen />)
    expect(await screen.findByText("Couldn't load your questions")).toBeInTheDocument()
    expect(screen.getByText('Questions file is unreadable')).toBeInTheDocument()
    expect(screen.queryByText("Can't reach the umless server")).toBeNull()
  })

  it('treats a 4xx without an error code as an answer, not as the backend being down', async () => {
    mocked.listQuestions.mockRejectedValue(new ApiError('Request failed (404)', 404))
    render(<QuestionsScreen />)
    expect(await screen.findByText("Couldn't load your questions")).toBeInTheDocument()
    expect(screen.getByText('Request failed (404)')).toBeInTheDocument()
  })

  it('shows skeleton rows only after 300 ms of loading', async () => {
    vi.useFakeTimers()
    mocked.listQuestions.mockReturnValue(new Promise(() => {}))
    render(<QuestionsScreen />)
    await act(() => vi.advanceTimersByTimeAsync(299))
    expect(screen.queryByLabelText('Loading questions')).toBeNull()
    await act(() => vi.advanceTimersByTimeAsync(2))
    expect(screen.getByLabelText('Loading questions')).toBeInTheDocument()
  })

  it('never shows skeletons when loading is fast', async () => {
    vi.useFakeTimers()
    mocked.listQuestions.mockResolvedValue(three)
    render(<QuestionsScreen />)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(screen.queryByLabelText('Loading questions')).toBeNull()
    expect(screen.getByText('3 questions')).toBeInTheDocument()
  })
})

describe('QuestionsScreen add', () => {
  it('disables Add for blank text', async () => {
    const user = await renderScreen()
    expect(addButton()).toBeDisabled()
    await user.type(field(), '   ')
    expect(addButton()).toBeDisabled()
  })

  it('creates the trimmed text on Enter, appends it and clears the field', async () => {
    const user = await renderScreen()
    mocked.createQuestion.mockResolvedValue(q('d', 'New one'))
    await user.type(field(), '  New one  {Enter}')
    expect(mocked.createQuestion).toHaveBeenCalledWith('New one')
    expect(await screen.findByText('4 questions')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[3]).getByText('New one')).toBeInTheDocument()
    expect(field()).toHaveValue('')
  })

  it('creates the question when the Add button is clicked', async () => {
    const user = await renderScreen()
    mocked.createQuestion.mockResolvedValue(q('d', 'Via button'))
    await user.type(field(), 'Via button')
    await user.click(addButton())
    expect(mocked.createQuestion).toHaveBeenCalledWith('Via button')
    expect(await screen.findByText('Via button')).toBeInTheDocument()
  })

  it('shows the too-long error and disables Add over 500 characters', async () => {
    const user = await renderScreen()
    await user.click(field())
    await user.paste('a'.repeat(501))
    expect(screen.getByText(/Keep questions under 500 characters/)).toBeInTheDocument()
    expect(addButton()).toBeDisabled()
  })

  it('shows the counter from 450 characters but not at 449', async () => {
    const user = await renderScreen()
    await user.click(field())
    await user.paste('a'.repeat(449))
    expect(screen.queryByText('449 / 500')).toBeNull()
    await user.type(field(), 'a')
    expect(screen.getByText('450 / 500')).toBeInTheDocument()
  })

  it('warns about a duplicate with its number and still adds via "Add anyway"', async () => {
    const user = await renderScreen()
    mocked.createQuestion.mockResolvedValue(q('d', 'why this role?'))
    await user.type(field(), 'why this role?')
    expect(screen.getByText('You already have this question (#2).')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add anyway' }))
    expect(mocked.createQuestion).toHaveBeenCalledWith('why this role?')
    expect(await screen.findByText('4 questions')).toBeInTheDocument()
  })

  it('keeps the typed text and shows the save error when saving fails', async () => {
    const user = await renderScreen()
    mocked.createQuestion.mockRejectedValue(unreachable())
    await user.type(field(), 'Keep me{Enter}')
    expect(
      await screen.findByText(/Couldn't save\. Check that the backend is running, then press Add again\./),
    ).toBeInTheDocument()
    expect(field()).toHaveValue('Keep me')
    expect(screen.getByText('3 questions')).toBeInTheDocument()
  })

  it("shows the server's field message for a 422", async () => {
    const user = await renderScreen()
    mocked.createQuestion.mockRejectedValue(
      new ApiError('Invalid', 422, 'validation_error', [{ field: 'text', message: 'Text must not be blank' }]),
    )
    await user.type(field(), 'x{Enter}')
    expect(await screen.findByText(/Text must not be blank/)).toBeInTheDocument()
    expect(field()).toHaveValue('x')
  })

  it('keeps text typed while the previous add is still saving', async () => {
    const user = await renderScreen()
    let finishSave: (question: Question) => void = () => {}
    mocked.createQuestion.mockReturnValue(new Promise((resolve) => (finishSave = resolve)))
    await user.type(field(), 'First{Enter}')
    await user.type(field(), ' and second')
    await act(async () => finishSave(q('d', 'First')))
    expect(field()).toHaveValue('First and second')
  })
})

describe('QuestionsScreen edit', () => {
  it('turns the row into a field with the pencil, saves on Enter and shows Saved', async () => {
    const user = await renderScreen()
    mocked.updateQuestion.mockResolvedValue(q('b', 'Why us?'))
    await user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const input = screen.getByRole('textbox', { name: 'Edit question 2' })
    expect(input).toHaveValue('Why this role?')
    await user.clear(input)
    await user.type(input, 'Why us?{Enter}')
    expect(mocked.updateQuestion).toHaveBeenCalledWith('b', 'Why us?')
    expect(await screen.findByText('✓ Saved')).toBeInTheDocument()
    expect(screen.getByText('Why us?')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Edit question 2' })).toBeNull()
  })

  it('does not save on the Enter that confirms an IME composition', async () => {
    const user = await renderScreen()
    await user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const input = screen.getByRole('textbox', { name: 'Edit question 2' })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(mocked.updateQuestion).not.toHaveBeenCalled()
    expect(input).toBeInTheDocument()
  })

  it('starts editing on double-click of the text', async () => {
    const user = await renderScreen()
    await user.dblClick(screen.getByText('Why this role?'))
    expect(screen.getByRole('textbox', { name: 'Edit question 2' })).toBeInTheDocument()
  })

  it('cancels with Esc without saving', async () => {
    const user = await renderScreen()
    await user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const input = screen.getByRole('textbox', { name: 'Edit question 2' })
    await user.clear(input)
    await user.type(input, 'Changed{Escape}')
    expect(mocked.updateQuestion).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Edit question 2' })).toBeNull()
    expect(screen.getByText('Why this role?')).toBeInTheDocument()
  })

  it('shows "This question was deleted" and reloads the list on a 404', async () => {
    const user = await renderScreen()
    mocked.updateQuestion.mockRejectedValue(new ApiError('Not found', 404, 'not_found'))
    mocked.listQuestions.mockResolvedValue([three[0], three[2]])
    await user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const input = screen.getByRole('textbox', { name: 'Edit question 2' })
    await user.clear(input)
    await user.type(input, 'Gone{Enter}')
    expect(await screen.findByText('This question was deleted')).toBeInTheDocument()
    expect(await screen.findByText('2 questions')).toBeInTheDocument()
    expect(mocked.listQuestions).toHaveBeenCalledTimes(2)
  })

  it('keeps the field open with an inline error and the text on a network failure', async () => {
    const user = await renderScreen()
    mocked.updateQuestion.mockRejectedValue(unreachable())
    await user.click(screen.getByRole('button', { name: 'Edit question 2' }))
    const input = screen.getByRole('textbox', { name: 'Edit question 2' })
    await user.clear(input)
    await user.type(input, 'Unsaved{Enter}')
    expect(
      await screen.findByText(/Couldn't save\. Check that the backend is running, then press Save again\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Edit question 2' })).toHaveValue('Unsaved')
  })
})

describe('QuestionsScreen delete', () => {
  async function openDialog(user: Awaited<ReturnType<typeof renderScreen>>, n = 2) {
    await user.click(screen.getByRole('button', { name: `Delete question ${n}` }))
    return screen.getByRole('alertdialog')
  }

  it('opens a dialog quoting the text with focus on Cancel', async () => {
    const user = await renderScreen()
    const dialog = await openDialog(user)
    expect(within(dialog).getByText('Delete this question?')).toBeInTheDocument()
    expect(within(dialog).getByText(/"Why this role\?"/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('closes with Cancel and keeps the row', async () => {
    const user = await renderScreen()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Why this role?')).toBeInTheDocument()
    expect(mocked.deleteQuestion).not.toHaveBeenCalled()
  })

  it('closes with Esc and keeps the row', async () => {
    const user = await renderScreen()
    await openDialog(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByText('Why this role?')).toBeInTheDocument()
    expect(mocked.deleteQuestion).not.toHaveBeenCalled()
  })

  it('removes the row on Delete and shows "Question deleted" with Undo', async () => {
    const user = await renderScreen()
    mocked.deleteQuestion.mockResolvedValue(undefined)
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(mocked.deleteQuestion).toHaveBeenCalledWith('b')
    expect(await screen.findByText('Question deleted')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.queryByText('Why this role?')).toBeNull()
    expect(screen.getByText('2 questions')).toBeInTheDocument()
  })

  it('re-creates the question at its old position on Undo', async () => {
    const user = await renderScreen()
    mocked.deleteQuestion.mockResolvedValue(undefined)
    mocked.createQuestion.mockResolvedValue(q('b2', 'Why this role?'))
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(mocked.createQuestion).toHaveBeenCalledWith('Why this role?', 1)
    expect(await screen.findByText('3 questions')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[1]).getByText('Why this role?')).toBeInTheDocument()
  })

  it('treats a 404 on delete as deleted', async () => {
    const user = await renderScreen()
    mocked.deleteQuestion.mockRejectedValue(new ApiError('Not found', 404, 'not_found'))
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('Question deleted')).toBeInTheDocument()
    expect(screen.queryByText('Why this role?')).toBeNull()
  })

  it('keeps the row and shows a retry message on a network failure', async () => {
    const user = await renderScreen()
    mocked.deleteQuestion.mockRejectedValue(unreachable())
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText("Couldn't delete. Try again.")).toBeInTheDocument()
    expect(screen.getByText('Why this role?')).toBeInTheDocument()
    expect(screen.getByText('3 questions')).toBeInTheDocument()
  })

  it('shows the empty state after deleting the last question', async () => {
    const user = await renderScreen([q('a', 'Only one')])
    mocked.deleteQuestion.mockResolvedValue(undefined)
    const dialog = await openDialog(user, 1)
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await screen.findByText('No questions yet.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^\+ / })).toHaveLength(3)
  })
})

describe('QuestionsScreen filter', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => q(`id${i}`, `Question ${i + 1} ${i === 10 ? 'special' : 'plain'}`))

  it('has no filter with 10 questions', async () => {
    await renderScreen(many(10))
    expect(screen.queryByLabelText('Filter questions')).toBeNull()
  })

  it('shows a filter with 11 questions that narrows the list and keeps original numbers', async () => {
    const user = await renderScreen(many(11))
    await user.type(screen.getByLabelText('Filter questions'), 'SPECIAL')
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('11')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Question 11 special')).toBeInTheDocument()
  })
})
