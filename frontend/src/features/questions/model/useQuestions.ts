import { useQuery } from '@tanstack/react-query'
import { queryClient, withTimeout } from '@/shared/api/query'
import { createQuestion, listQuestions } from '../api/questionsApi'
import type { Question } from './questionText'

export const QUESTIONS_KEY = ['questions'] as const

/** The signed-in user's questions, in order: one cache for every screen that lists them. */
export function useQuestions() {
  return useQuery({ queryKey: QUESTIONS_KEY, queryFn: ({ signal }) => listQuestions(withTimeout(signal)) }, queryClient)
}

/** Change the cached list after a successful write (add, edit, delete, undo), so no refetch is needed. */
export function updateCachedQuestions(update: (questions: Question[]) => Question[]) {
  queryClient.setQueryData<Question[]>(QUESTIONS_KEY, (questions) => update(questions ?? []))
}

/** Something changed the list elsewhere (a question was deleted in another tab): load it again. */
export function invalidateQuestions() {
  return queryClient.invalidateQueries({ queryKey: QUESTIONS_KEY })
}

/** Starter questions offered on an empty list. */
export const SUGGESTED_QUESTIONS = [
  'Tell me about yourself.',
  "What's your biggest weakness?",
  'Explain your last project in two minutes.',
] as const

/** Save a new question at the end of the list (or at `position`) and show it on every screen. */
export async function addQuestion(text: string): Promise<Question> {
  const created = await createQuestion(text)
  updateCachedQuestions((questions) => [...questions, created])
  return created
}
