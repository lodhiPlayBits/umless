import { useState } from 'react'
import { Banner } from '@/shared/ui'
import AddQuestionForm from './AddQuestionForm'
import { SUGGESTED_QUESTIONS, addQuestion, useQuestions } from '../model/useQuestions'
import './questions.css'

/** Add a first question from anywhere (the dashboard's checklist): the field and starter chips. */
export default function QuickAddQuestion() {
  const questions = useQuestions()
  const [error, setError] = useState<string | null>(null)

  async function addSuggestion(text: string) {
    setError(null)
    try {
      await addQuestion(text)
    } catch {
      setError("Couldn't save. Check your connection.")
    }
  }

  return (
    <div className="q-quick">
      <AddQuestionForm
        questions={questions.data ?? []}
        disabled={!questions.isSuccess}
        onAdd={addQuestion}
      />
      <div className="q-quick__suggestions">
        <span className="q-hint">Or start with one of these:</span>
        <div className="q-quick__chips">
          {SUGGESTED_QUESTIONS.map((text) => (
            <button key={text} type="button" className="q-chip" onClick={() => void addSuggestion(text)}>
              + {text}
            </button>
          ))}
        </div>
      </div>
      {error && <Banner tone="danger" title={error} />}
    </div>
  )
}
