import { useQuery } from '@tanstack/react-query'
import { queryClient, withTimeout } from '@/shared/api/query'
import { getAccount } from '../api/billingApi'
import type { Account } from '../api/billingApi'

/** The signed-in user's practice time, shared by the shell, practice screen and settings. */
export type AccountState =
  | { status: 'loading' | 'error'; account: Account | null }
  | { status: 'ready'; account: Account }

export const ACCOUNT_KEY = ['account'] as const

export function useAccount(): AccountState {
  const query = useQuery(
    { queryKey: ACCOUNT_KEY, queryFn: ({ signal }) => getAccount(withTimeout(signal)) },
    queryClient,
  )
  if (query.data) return { status: 'ready', account: query.data }
  return { status: query.isError ? 'error' : 'loading', account: null }
}

/** A payment's response carries the new balance: show it without another request. */
export function setAccount(account: Account) {
  queryClient.setQueryData(ACCOUNT_KEY, account)
}

/**
 * After a transcription used time. Refetches only while something shows the balance (sign-in is
 * on, a screen is mounted); otherwise it's just marked stale for the next screen that asks.
 */
export function refreshAccountIfShown() {
  void queryClient.invalidateQueries({ queryKey: ACCOUNT_KEY })
}

/** Forget the balance (tests; sign-out clears all server data). */
export function resetAccount() {
  queryClient.removeQueries({ queryKey: ACCOUNT_KEY })
}

/** "59 min", "4 h 55 min"; whole minutes, rounded down. */
export function formatPracticeTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`
}

/** Everything left to practise with, e.g. "3 free + 1 h left"; paid time shows even while free remains. */
export function practiceTimeLabel(account: Account): string {
  const parts = [
    account.free_transcriptions_left > 0 ? `${account.free_transcriptions_left} free` : null,
    account.seconds_left > 0 ? formatPracticeTime(account.seconds_left) : null,
  ].filter(Boolean)
  return parts.length ? `${parts.join(' + ')} left` : 'Buy practice time'
}
