import type { components } from '../generated/openapi'

export type Question = components['schemas']['Question']

export const MAX_QUESTION_LENGTH = 500
/** The character counter appears from this length (docs/design/flows.md F1.5). */
export const COUNTER_FROM = 450

/** Length as the server counts it: Unicode code points, after trimming (emoji count as one). */
export function questionLength(text: string): number {
  return [...text.trim()].length
}

function normalized(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

export type TextCheck =
  | { kind: 'empty' }
  | { kind: 'too-long'; length: number }
  | { kind: 'duplicate'; number: number }
  | { kind: 'ok' }

/**
 * What the add and edit fields show for `text`. Duplicates (case- and space-insensitive) are
 * only a warning; `number` is the 1-based position of the existing question. The question
 * being edited (`editingId`) doesn't count as its own duplicate.
 */
export function checkQuestionText(text: string, questions: Question[], editingId?: string): TextCheck {
  if (!text.trim()) return { kind: 'empty' }
  const length = questionLength(text)
  if (length > MAX_QUESTION_LENGTH) return { kind: 'too-long', length }
  const key = normalized(text)
  const index = questions.findIndex((q) => q.id !== editingId && normalized(q.text) === key)
  if (index !== -1) return { kind: 'duplicate', number: index + 1 }
  return { kind: 'ok' }
}

/** Case-insensitive substring filter for lists of more than 10 questions (E24). */
export function matchesFilter(question: Question, filter: string): boolean {
  return question.text.toLowerCase().includes(filter.trim().toLowerCase())
}
