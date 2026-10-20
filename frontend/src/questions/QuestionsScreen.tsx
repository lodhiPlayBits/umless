import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../client'
import ConfirmDialog from '../components/ConfirmDialog'
import LoadErrorBanner from '../components/LoadErrorBanner'
import Toast from '../components/Toast'
import type { ToastMessage } from '../components/Toast'
import AddQuestionForm from './AddQuestionForm'
import QuestionRow from './QuestionRow'
import * as api from './questionsApi'
import { matchesFilter } from './questionText'
import type { Question } from './questionText'

/** docs/design/flows.md F1: skeleton rows only after 300 ms; give up after 10 s. */
const SKELETON_DELAY_MS = 300
const LOAD_TIMEOUT_MS = 10_000
const UNDO_MS = 5000
const SAVED_TICK_MS = 2000
const FILTER_FROM = 11

const SUGGESTIONS = [
  'Tell me about yourself.',
  "What's your biggest weakness?",
  'Explain your last project in two minutes.',
]

type Load = { status: 'loading'; showSkeleton: boolean } | { status: 'error'; error: ApiError } | { status: 'ready' }

export default function QuestionsScreen() {
  const [load, setLoad] = useState<Load>({ status: 'loading', showSkeleton: false })
  const [questions, setQuestions] = useState<Question[]>([])
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const toastCount = useRef(0)
  const loadController = useRef<AbortController | null>(null)

  const showToast = useCallback((text: string, extra: Omit<ToastMessage, 'id' | 'text'> = {}) => {
    toastCount.current += 1
    setToast({ id: toastCount.current, text, ...extra })
  }, [])
  const dismissToast = useCallback(() => setToast(null), [])

  const loadQuestions = useCallback(async () => {
    // Only the latest load may update the screen (Retry clicked twice, a reload after a 404).
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoad({ status: 'loading', showSkeleton: false })
    const skeleton = window.setTimeout(() => setLoad((l) => (l.status === 'loading' ? { ...l, showSkeleton: true } : l)), SKELETON_DELAY_MS)
    const timeout = window.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS)
    try {
      const questions = await api.listQuestions(controller.signal)
      if (loadController.current !== controller) return
      setQuestions(questions)
      setLoad({ status: 'ready' })
    } catch (error) {
      if (loadController.current !== controller) return
      setLoad({ status: 'error', error: error instanceof ApiError ? error : new ApiError(String(error), 0) })
    } finally {
      window.clearTimeout(skeleton)
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    void loadQuestions()
    return () => {
      loadController.current?.abort()
      loadController.current = null
    }
  }, [loadQuestions])

  useEffect(() => {
    if (!savedId) return
    const timer = window.setTimeout(() => setSavedId(null), SAVED_TICK_MS)
    return () => window.clearTimeout(timer)
  }, [savedId])

  async function addQuestion(text: string) {
    const created = await api.createQuestion(text)
    setQuestions((qs) => [...qs, created])
  }

  async function addSuggestion(text: string) {
    try {
      await addQuestion(text)
    } catch {
      showToast("Couldn't save. Check that the backend is running.")
    }
  }

  async function saveEdit(question: Question, text: string) {
    try {
      const updated = await api.updateQuestion(question.id, text)
      setQuestions((qs) => qs.map((q) => (q.id === updated.id ? updated : q)))
      setEditingId(null)
      setSavedId(updated.id)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setEditingId(null)
        showToast('This question was deleted')
        void loadQuestions()
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
    setQuestions((qs) => qs.filter((q) => q.id !== question.id))
    showToast('Question deleted', {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => void undoDelete(question, index) },
    })
  }

  async function undoDelete(question: Question, index: number) {
    try {
      const restored = await api.createQuestion(question.text, index)
      setQuestions((qs) => [...qs.slice(0, index), restored, ...qs.slice(index)])
    } catch {
      showToast("Couldn't undo. Check that the backend is running.")
    }
  }

  const ready = load.status === 'ready'
  const empty = ready && questions.length === 0
  const showFilter = ready && questions.length >= FILTER_FROM
  const visible = questions
    .map((question, index) => ({ question, number: index + 1 }))
    .filter(({ question }) => !showFilter || matchesFilter(question, filter))

  return (
    <>
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

      {load.status === 'error' && (
        <LoadErrorBanner error={load.error} title="Couldn't load your questions" onRetry={() => void loadQuestions()} />
      )}

      <AddQuestionForm questions={questions} disabled={!ready} onAdd={addQuestion} />

      {load.status === 'loading' && load.showSkeleton && (
        <div className="q-list" aria-busy="true" aria-label="Loading questions">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}

      {empty && (
        <div className="empty">
          <p>
            <strong>No questions yet.</strong>
          </p>
          <p className="muted small">Start with one of these, or type your own above:</p>
          <div className="chips">
            {SUGGESTIONS.map((text) => (
              <button key={text} type="button" className="chip" onClick={() => void addSuggestion(text)}>
                + {text}
              </button>
            ))}
          </div>
        </div>
      )}

      {ready && !empty && (
        <>
          <div className="list-head">
            <strong>
              {questions.length} {questions.length === 1 ? 'question' : 'questions'}
            </strong>
          </div>
          {showFilter && (
            <div className="filter-row">
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter questions"
                aria-label="Filter questions"
              />
            </div>
          )}
          {visible.length === 0 ? (
            <p className="muted">No questions match "{filter.trim()}".</p>
          ) : (
            <ul className="q-list">
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
    </>
  )
}
