import type { APIRequestContext } from '@playwright/test'

/** Deletes every question, so each test starts from an empty list. */
export async function resetQuestions(request: APIRequestContext) {
  const response = await request.get('/api/questions')
  const { items } = (await response.json()) as { items: { id: string }[] }
  for (const { id } of items) await request.delete(`/api/questions/${id}`)
}

/** Creates questions through the API, in order, and returns them. */
export async function seedQuestions(request: APIRequestContext, texts: string[]) {
  const created: { id: string; text: string }[] = []
  for (const text of texts) {
    const response = await request.post('/api/questions', { data: { text } })
    created.push(await response.json())
  }
  return created
}

/**
 * POST /api/transcriptions, with or without the ?questionId= the practice page adds to save the
 * take. A '**\/api/transcriptions' glob misses the query string, so mocks wouldn't apply.
 */
export const TRANSCRIPTIONS = /\/api\/transcriptions(\?|$)/
