import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/shared/api/client'
import { useDelayedFlag } from '@/shared/lib/useDelayedFlag'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import LoadErrorBanner from '@/shared/ui/LoadErrorBanner'
import Toast from '@/shared/ui/Toast'
import { EmptyState, Input, Panel, Skeleton } from '@/shared/ui'
import type { ToastMessage } from '@/shared/ui/Toast'
import AddQuestionForm from './AddQuestionForm'
import QuestionRow from './QuestionRow'
import './questions.css'
import * as api from '../api/questionsApi'
import { matchesFilter } from '../model/questionText'
import type { Question } from '../model/questionText'
import { invalidateQuestions, updateCachedQuestions, useQuestions } from '../model/useQuestions'

/** docs/design/flows.md F1: skeleton rows only after 300 ms; the query gives up after 10 s. */
const SKELETON_DELAY_MS = 300
const UNDO_MS = 5000
const SAVED_TICK_MS = 2000
const FILTER_FROM = 11

const SUGGESTIONS = [
  'Tell me about yourself.',
  "What's your biggest weakness?",
  'Explain your last project in two minutes.',
]

type Load = { status: 'loading' } | { status: 'error'; error: ApiError } | { status: 'ready' }

export default function QuestionsScreen() {
  const query = useQuestions()
  const questions = query.data ?? []
  // A Retry after an error is a fresh load (banner gone, field disabled); a refetch over loaded data isn't.
  const load: Load =
    query.isFetching && !query.isSuccess
      ? { status: 'loading' }
      : query.isError
        ? { status: 'error', error: query.error instanceof ApiError ? query.error : new ApiError(String(query.error), 0) }
        : query.isSuccess
          ? { status: 'ready' }
          : { status: 'loading' }
  const showSkeleton = useDelayedFlag(load.status === 'loading', SKELETON_DELAY_MS)
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastCount = useRef(0)

  const showToast = useCallback((text: string, extra: Omit<ToastMessage, 'id' | 'text'> = {}) => {
    toastCount.current += 1
    setToast({ id: toastCount.current, text, ...extra })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  const reload = useCallback(() => void query.refetch(), [query])

  useEffect(() => {
    if (!savedId) return
    const timer = window.setTimeout(() => setSavedId(null), SAVED_TICK_MS)
    return () => window.clearTimeout(timer)
  }, [savedId])

  async function addQuestion(text: string) {
    const created = await api.createQuestion(text)
    updateCachedQuestions((qs) => [...qs, created])
  }

  async function addSuggestion(text: string) {
    try {
      await addQuestion(text)
    } catch {
      showToast("Couldn't save. Check your connection.")
    }
  }

  async function saveEdit(question: Question, text: string) {
    try {
      const updated = await api.updateQuestion(question.id, text)
      updateCachedQuestions((qs) => qs.map((q) => (q.id === updated.id ? updated : q)))
      setEditingId(null)
      setSavedId(updated.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setEditingId(null)
        showToast('This question was deleted')
        void invalidateQuestions()
        return
      }
      throw error // the row shows it inline and keeps the text
    }
  }

  async function confirmDelete() {
    const question = pendingDelete
    if (!question) return
    setPendingDelete(null)
    const index = questions.findIndex((q) => q.id === question.id)
    try {
      await api.deleteQuestion(question.id)
    } catch (error) {
      // 404: already gone (another tab), so treat it as deleted.
      if (!(error instanceof ApiError && error.status === 404)) {
        showToast("Couldn't delete. Try again.")
        return
      }
    }
    updateCachedQuestions((qs) => qs.filter((q) => q.id !== question.id))
    showToast('Question deleted', {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => void undoDelete(question, index) },
    })
  }

  async function undoDelete(question: Question, index: number) {
    try {
      const restored = await api.createQuestion(question.text, index)
      updateCachedQuestions((qs) => [...qs.slice(0, index), restored, ...qs.slice(index)])
    } catch {
      showToast("Couldn't undo. Check your connection.")
    }
  }

  const ready = load.status === 'ready'
  const empty = ready && questions.length === 0
  const showFilter = ready && questions.length >= FILTER_FROM
  const visible = questions
    .map((question, index) => ({ question, number: index + 1 }))
    .filter(({ question }) => !showFilter || matchesFilter(question, filter))

  return (
    <div className="questions">
      <div className="questions__head">
        {empty ? (
          <>
            <h1>Practise saying it out loud</h1>
            <p className="muted">
              Add the questions you want to practise, record your answer, and see every "um", "uh" and long pause in the
              transcript.
            </p>
          </>
        ) : (
          <>
            <h1>Your questions</h1>
            {ready && <p className="muted">Pick one to practise, or add more.</p>}
          </>
        )}
      </div>

      {load.status === 'error' && <LoadErrorBanner error={load.error} title="Couldn't load your questions" onRetry={reload} />}

      <Panel aria-label="Add a question">
        <AddQuestionForm questions={questions} disabled={!ready} onAdd={addQuestion} />
      </Panel>

      {load.status === 'loading' && showSkeleton && (
        <div className="ui-list" aria-busy="true" aria-label="Loading questions">
          {['60%', '75%', '50%'].map((width) => (
            <div key={width} className="ui-row">
              <span className="ui-row__text">
                <Skeleton width={width} />
                <Skeleton width="30%" height={12} />
              </span>
            </div>
          ))}
        </div>
      )}

      {empty && (
        <EmptyState
          icon="list"
          title="No questions yet."
          actions={SUGGESTIONS.map((text) => (
            <button key={text} type="button" className="q-chip" onClick={() => void addSuggestion(text)}>
              + {text}
            </button>
          ))}
        >
          Start with one of these, or type your own above:
        </EmptyState>
      )}

      {ready && !empty && (
        <>
          <div className="questions__list-head">
            <strong>
              {questions.length} {questions.length === 1 ? 'question' : 'questions'}
            </strong>
            {showFilter && (
              <Input
                type="search"
                className="questions__filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter questions"
                aria-label="Filter questions"
              />
            )}
          </div>
          {visible.length === 0 ? (
            <p className="muted">No questions match "{filter.trim()}".</p>
          ) : (
            <ul className="ui-list">
              {visible.map(({ question, number }) => (
                <QuestionRow
                  key={question.id}
                  question={question}
                  number={number}
                  questions={questions}
                  editing={editingId === question.id}
                  justSaved={savedId === question.id}
                  onStartEdit={() => setEditingId(question.id)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={(text) => saveEdit(question, text)}
                  onDelete={() => setPendingDelete(question)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this question?"
          confirmLabel="Delete"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        >
          <p>"{pendingDelete.text}" You can undo for a few seconds afterwards.</p>
        </ConfirmDialog>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
