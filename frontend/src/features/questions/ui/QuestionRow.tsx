import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { relativeDay } from '@/features/progress'
import type { QuestionUsage } from '@/features/progress'
import { Badge, Button, ButtonLink, Icon, IconButton } from '@/shared/ui'
import { practicePath } from '@/shared/config/paths'
import { saveErrorMessage } from '../api/questionsApi'
import { MAX_QUESTION_LENGTH, checkQuestionText } from '../model/questionText'
import type { Question } from '../model/questionText'

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
  /** How often it was practised; null while unknown (not loaded, or failed), undefined = never. */
  usage?: QuestionUsage | null
}

export default function QuestionRow(props: QuestionRowProps) {
  const { question, number, editing, justSaved, onStartEdit, onDelete, usage } = props
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(editing)

  // Back from edit mode: return focus to the pencil so keyboard users don't lose their place.
  useEffect(() => {
    if (wasEditing.current && !editing) editButtonRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  if (editing) return <EditingRow {...props} />

  return (
    <li className="ui-row q-row">
      <span className="ui-row__lead num">{number}</span>
      <span className="ui-row__text">
        <span className="ui-row__title text" title={question.text} onDoubleClick={onStartEdit}>
          {question.text}
        </span>
        {usage !== null && <UsageLine usage={usage} />}
      </span>
      <span className="ui-row__end">
        {justSaved && (
          <span className="q-saved" role="status">
            ✓ Saved
          </span>
        )}
        <IconButton ref={editButtonRef} icon="edit" label={`Edit question ${number}`} onClick={onStartEdit} />
        <IconButton icon="trash" label={`Delete question ${number}`} onClick={onDelete} />
        <ButtonLink to={practicePath(question.id)} variant={usage === undefined ? 'primary' : 'secondary'} size="sm">
          Practise<span className="ui-sr-only"> question {number}</span>
        </ButtonLink>
      </span>
    </li>
  )
}

/** "Practised 3× · last today · 1.4 fillers/min", or "New · Not practised yet". */
function UsageLine({ usage }: { usage: QuestionUsage | undefined }) {
  if (!usage) {
    return (
      <span className="ui-row__meta">
        <Badge tone="primary">New</Badge> Not practised yet
      </span>
    )
  }
  const parts = [
    usage.count === 1 ? 'Practised once' : `Practised ${usage.count}×`,
    `last ${relativeDay(usage.lastAt, new Date())}`,
    usage.latestFillersPerMinute === null ? null : `${usage.latestFillersPerMinute.toFixed(1)} fillers/min`,
  ]
  return <span className="ui-row__meta">{parts.filter(Boolean).join(' · ')}</span>
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
  if (saveError) message = { kind: 'error', text: saveError }
  else if (check.kind === 'too-long')
    message = { kind: 'error', text: `Keep questions under ${MAX_QUESTION_LENGTH} characters (${check.length} now).` }
  else if (check.kind === 'duplicate') message = { kind: 'warn', text: `You already have this question (#${check.number}).` }

  return (
    <li className="ui-row q-row q-row--editing">
      <span className="ui-row__lead num">{number}</span>
      <div className="q-edit">
      <input
        ref={inputRef}
        className="ui-input edit-field"
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
      {message && (
        <p id={messageId} className={`field-msg q-message q-message--${message.kind}`} role={saveError ? 'alert' : undefined}>
          <span>
            <Icon name={message.kind === 'error' ? 'alert' : 'info'} />
            {message.text}
          </span>
        </p>
      )}
      <div className="q-edit__actions">
        <span className="q-hint">Enter saves · Esc cancels</span>
        <Button variant="ghost" size="sm" onClick={onCancelEdit}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={!canSave}>
          {check.kind === 'duplicate' ? 'Save anyway' : 'Save'}
        </Button>
      </div>
      </div>
    </li>
  )
}
