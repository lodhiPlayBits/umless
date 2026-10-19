import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import Link from '../Link'
import { practicePath } from '../router'
import { saveErrorMessage } from './questionsApi'
import { MAX_QUESTION_LENGTH, checkQuestionText } from './questionText'
import type { Question } from './questionText'

interface QuestionRowProps {
  question: Question
  /** 1-based position in the whole list (kept when the list is filtered). */
  number: number
  questions: Question[]
  editing: boolean
  justSaved: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  /** Saves the trimmed text; rejects with an ApiError when it can't. */
  onSave: (text: string) => Promise<void>
  onDelete: () => void
}

export default function QuestionRow(props: QuestionRowProps) {
  const { question, number, editing, justSaved, onStartEdit, onDelete } = props
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)

  // Back from edit mode: return focus to the pencil so keyboard users don't lose their place.
  useEffect(() => {
    if (wasEditing.current && !editing) editButtonRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  if (editing) return <EditingRow {...props} />

  return (
    <li className="q-row">
      <span className="num">{number}</span>
      <span className="text" title={question.text} onDoubleClick={onStartEdit}>
        {question.text}
      </span>
      <span className="tools">
        {justSaved && <span className="saved" role="status">✓ Saved</span>}
        <button
          ref={editButtonRef}
          type="button"
          className="btn btn-ghost icon-btn"
          aria-label={`Edit question ${number}`}
          onClick={onStartEdit}
        >
          ✎
        </button>
        <button type="button" className="btn btn-ghost icon-btn" aria-label={`Delete question ${number}`} onClick={onDelete}>
          🗑
        </button>
        <Link to={practicePath(question.id)} className="btn btn-primary">
          Practise<span className="visually-hidden"> question {number}</span>
        </Link>
      </span>
    </li>
  )
}

function EditingRow({ question, number, questions, onCancelEdit, onSave }: QuestionRowProps) {
  const [text, setText] = useState(question.text)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messageId = useId()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const check = checkQuestionText(text, questions, question.id)
  const canSave = !saving && (check.kind === 'ok' || check.kind === 'duplicate')

  async function save() {
    if (!canSave) return
    if (text.trim() === question.text) {
      onCancelEdit() // nothing changed
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(text.trim())
    } catch (error) {
      setSaveError(saveErrorMessage(error, 'Save'))
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Enter that confirms an IME composition (e.g. Japanese input) isn't a save.
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter') {
      event.preventDefault()
      void save()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancelEdit()
    }
  }

  let message: { kind: 'error' | 'warn'; text: string } | null = null
  if (saveError) message = { kind: 'error', text: `⚠ ${saveError}` }
  else if (check.kind === 'too-long')
    message = { kind: 'error', text: `⚠ Keep questions under ${MAX_QUESTION_LENGTH} characters (${check.length} now).` }
  else if (check.kind === 'duplicate') message = { kind: 'warn', text: `You already have this question (#${check.number}).` }

  return (
    <li className="q-row">
      <span className="num">{number}</span>
      <input
        ref={inputRef}
        className="edit-field"
        type="text"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setSaveError(null)
        }}
        onKeyDown={handleKeyDown}
        aria-label={`Edit question ${number}`}
        aria-invalid={check.kind === 'too-long' || undefined}
        aria-describedby={message ? messageId : undefined}
      />
      <span className="tools">
        <button type="button" className="btn btn-primary icon-btn" onClick={() => void save()} disabled={!canSave}>
          {check.kind === 'duplicate' ? 'Save anyway' : 'Save'}
        </button>
        <button type="button" className="btn btn-ghost icon-btn" onClick={onCancelEdit}>
          Cancel
        </button>
      </span>
      {message && (
        <p id={messageId} className={`field-msg q-edit-msg ${message.kind}`} role={saveError ? 'alert' : undefined}>
          {message.text}
        </p>
      )}
    </li>
  )
}
