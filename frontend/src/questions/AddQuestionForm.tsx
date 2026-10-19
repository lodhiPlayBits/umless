import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { saveErrorMessage } from './questionsApi'
import { COUNTER_FROM, MAX_QUESTION_LENGTH, checkQuestionText, questionLength } from './questionText'
import type { Question } from './questionText'

interface AddQuestionFormProps {
  questions: Question[]
  disabled?: boolean
  /** Saves the trimmed text; rejects with an ApiError when it can't. */
  onAdd: (text: string) => Promise<void>
}

export default function AddQuestionForm({ questions, disabled = false, onAdd }: AddQuestionFormProps) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messageId = useId()

  // Focus the field on desktop only: on phones it would pop up the keyboard straight away.
  useEffect(() => {
    if (!disabled && window.matchMedia?.('(pointer: fine)').matches) inputRef.current?.focus()
  }, [disabled])

  const check = checkQuestionText(text, questions)
  const length = questionLength(text)
  const canAdd = !disabled && !saving && (check.kind === 'ok' || check.kind === 'duplicate')
  const showCounter = length >= COUNTER_FROM

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canAdd) return
    setSaving(true)
    setSaveError(null)
    const submitted = text.trim()
    try {
      await onAdd(submitted)
      // Keep anything typed while it was saving.
      setText((current) => (current.trim() === submitted ? '' : current))
    } catch (error) {
      setSaveError(saveErrorMessage(error, 'Add'))
    } finally {
      setSaving(false)
      inputRef.current?.focus()
    }
  }

  let message: { kind: 'error' | 'warn'; text: string } | null = null
  if (saveError) message = { kind: 'error', text: `⚠ ${saveError}` }
  else if (check.kind === 'too-long') message = { kind: 'error', text: `⚠ Keep questions under ${MAX_QUESTION_LENGTH} characters.` }
  else if (check.kind === 'duplicate') message = { kind: 'warn', text: `You already have this question (#${check.number}).` }

  return (
    <>
      <form className="add-row" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setSaveError(null)
          }}
          placeholder="Type a question you want to practise…"
          aria-label="New question"
          aria-invalid={check.kind === 'too-long' || undefined}
          aria-describedby={message || showCounter ? messageId : undefined}
          disabled={disabled}
        />
        <button type="submit" className="btn btn-primary" disabled={!canAdd}>
          {check.kind === 'duplicate' ? 'Add anyway' : 'Add'}
        </button>
      </form>
      {(message || showCounter) && (
        <p id={messageId} className={`field-msg ${message?.kind ?? ''}`} role={saveError ? 'alert' : undefined}>
          <span>{message?.text}</span>
          {showCounter && (
            <span>
              {length} / {MAX_QUESTION_LENGTH}
            </span>
          )}
        </p>
      )}
    </>
  )
}
