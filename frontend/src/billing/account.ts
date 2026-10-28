import { useEffect, useSyncExternalStore } from 'react'
import { getAccount } from './billingApi'
import type { Account } from './billingApi'

/** The signed-in user's practice time, shared by the header and the practice screen. */
export type AccountState =
  | { status: 'idle' | 'loading' | 'error'; account: Account | null }
  | { status: 'ready'; account: Account }

let state: AccountState = { status: 'idle', account: null }
const listeners = new Set<() => void>()

function set(next: AccountState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function setAccount(account: Account) {
  set({ status: 'ready', account })
}

export async function refreshAccount(): Promise<void> {
  set({ status: 'loading', account: state.account })
  try {
    setAccount(await getAccount())
  } catch {
    set({ status: 'error', account: state.account })
  }
}

/** After a transcription: only once something has shown the balance (sign-in is on). */
export function refreshAccountIfShown() {
  if (state.status !== 'idle') void refreshAccount()
}

/** For tests. */
export function resetAccount() {
  set({ status: 'idle', account: null })
}

export function useAccount(): AccountState {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
  useEffect(() => {
    if (state.status === 'idle') void refreshAccount()
  }, [])
  return current
}

/** "59 min", "4 h 55 min"; whole minutes, rounded down. */
export function formatPracticeTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`
}

/** The header chip's text: free transcriptions first, then paid time. */
export function practiceTimeLabel(account: Account): string {
  if (account.free_transcriptions_left > 0) return `${account.free_transcriptions_left} free left`
  if (account.seconds_left > 0) return `${formatPracticeTime(account.seconds_left)} left`
  return 'Buy practice time'
}
