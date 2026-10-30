import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { saveErrorMessage } from '../api/questionsApi'
import { COUNTER_FROM, MAX_QUESTION_LENGTH, checkQuestionText, questionLength } from '../model/questionText'
import type { Question } from '../model/questionText'
import { Button, Icon } from '@/shared/ui'

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
  if (saveError) message = { kind: 'error', text: saveError }
  else if (check.kind === 'too-long') message = { kind: 'error', text: `Keep questions under ${MAX_QUESTION_LENGTH} characters.` }
  else if (check.kind === 'duplicate') message = { kind: 'warn', text: `You already have this question (#${check.number}).` }

  return (
    <form className="q-add" onSubmit={handleSubmit}>
      <div className="q-add__row">
        <input
          ref={inputRef}
          type="text"
          className="ui-input"
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
        <Button type="submit" variant="primary" icon="plus" disabled={!canAdd}>
          {check.kind === 'duplicate' ? 'Add anyway' : 'Add'}
        </Button>
      </div>
      {message || showCounter ? (
        <p id={messageId} className={`field-msg q-message ${message ? `q-message--${message.kind}` : ''}`} role={saveError ? 'alert' : undefined}>
          <span>
            {message && <Icon name={message.kind === 'error' ? 'alert' : 'info'} />}
            {message?.text}
          </span>
          {showCounter && (
            <span>
              {length} / {MAX_QUESTION_LENGTH}
            </span>
          )}
        </p>
      ) : (
        <p className="q-hint">Press Enter to add. Up to {MAX_QUESTION_LENGTH} characters.</p>
      )}
    </form>
  )
}
