import { useQuery } from '@tanstack/react-query'
import { queryClient, withTimeout } from '@/shared/api/query'
import type { TakeSummary, TakesApi } from '../api/takesApi'

/** Query keys for saved takes. Invalidating TAKES_KEY refreshes every takes list on screen. */
export const TAKES_KEY = ['takes'] as const
export const questionTakesKey = (questionId: string) => [...TAKES_KEY, 'question', questionId] as const

/** One question's saved takes, newest first. */
export function useQuestionTakes(questionId: string, api: TakesApi) {
  return useQuery(
    { queryKey: questionTakesKey(questionId), queryFn: ({ signal }) => api.list(questionId, withTimeout(signal)) },
    queryClient,
  )
}

/** Drop a deleted take from the cached list. */
export function removeCachedTake(questionId: string, takeId: string) {
  queryClient.setQueryData<TakeSummary[]>(questionTakesKey(questionId), (takes) => takes?.filter((take) => take.id !== takeId))
}

/** A take was saved (or changed elsewhere): every takes list reloads when next shown. */
export function invalidateTakes() {
  return queryClient.invalidateQueries({ queryKey: TAKES_KEY })
}
