import { ApiError, client, unwrap } from '../client'
import type { Question } from './questionText'

export async function listQuestions(signal?: AbortSignal): Promise<Question[]> {
  const body = await unwrap(client.GET('/api/questions', { signal }))
  return body.items
}

/** Appends, or inserts at `position` (used by Undo to put a deleted question back). */
export function createQuestion(text: string, position?: number): Promise<Question> {
  const body = position === undefined ? { text } : { text, position }
  return unwrap(client.POST('/api/questions', { body }))
}

export function updateQuestion(questionId: string, text: string): Promise<Question> {
  return unwrap(
    client.PATCH('/api/questions/{questionId}', { params: { path: { questionId } }, body: { text } }),
  )
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await unwrap(client.DELETE('/api/questions/{questionId}', { params: { path: { questionId } } }))
}

/** The error text for a failed save; the typed text is always kept for a retry. */
export function saveErrorMessage(error: unknown, retryLabel: string): string {
  if (error instanceof ApiError && error.code === 'validation_error' && error.fields?.length) {
    return error.fields[0].message
  }
  return `Couldn't save. Check that the backend is running, then press ${retryLabel} again.`
}
