import { useQuery } from '@tanstack/react-query'
import { queryClient, withTimeout } from '@/shared/api/query'
import { listAllTakes, takesApi } from '../api/takesApi'
import type { TakeFilter, TakeSummary, TakesApi } from '../api/takesApi'

/**
 * Query keys for saved takes. Every takes query starts with TAKES_KEY, so invalidating it
 * refreshes them all: a question's list, History's lists and an opened take.
 */
export const TAKES_KEY = ['takes'] as const
export const questionTakesKey = (questionId: string) => [...TAKES_KEY, 'question', questionId] as const
export const allTakesKey = (filter: TakeFilter) => [...TAKES_KEY, 'all', filter] as const
export const takeKey = (takeId: string) => [...TAKES_KEY, 'one', takeId] as const

/** One question's saved takes, newest first. */
export function useQuestionTakes(questionId: string, api: TakesApi) {
  return useQuery(
    { queryKey: questionTakesKey(questionId), queryFn: ({ signal }) => api.list(questionId, withTimeout(signal)) },
    queryClient,
  )
}

/** Takes across questions, newest first (History, the Dashboard, the questions list's "practised" line). */
export function useAllTakes(filter: TakeFilter = {}) {
  return useQuery({ queryKey: allTakesKey(filter), queryFn: ({ signal }) => listAllTakes(filter, withTimeout(signal)) }, queryClient)
}

/** One take with its transcript. */
export function useTake(takeId: string, api: TakesApi = takesApi) {
  return useQuery({ queryKey: takeKey(takeId), queryFn: () => api.get(takeId) }, queryClient)
}

/** Drop a deleted take from every cached list, so no screen shows it while refetching. */
export function removeCachedTake(takeId: string) {
  queryClient.setQueriesData<TakeSummary[]>({ queryKey: TAKES_KEY }, (takes) =>
    Array.isArray(takes) ? takes.filter((take) => take.id !== takeId) : takes,
  )
  queryClient.removeQueries({ queryKey: takeKey(takeId) })
}

/** A take was saved or deleted: every takes list reloads when next shown. */
export function invalidateTakes() {
  return queryClient.invalidateQueries({ queryKey: TAKES_KEY })
}
