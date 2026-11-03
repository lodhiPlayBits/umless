import { MAX_RECORDING_MS } from './recorder'

/** What this needs of the account (billing's Account has more). */
type TimeLeft = { metered: boolean; free_seconds_left: number; seconds_left: number } | null | undefined

/**
 * The server refuses a recording longer than the time left (402), so the recorder stops at the
 * time left instead: every last second can be used, and the take can always be transcribed. A
 * second is held back because a recording runs a few frames past its timer, and the server
 * rounds the length up to a whole second.
 */
const HELD_BACK_MS = 1000

/**
 * How long a recording may run: the 10-minute limit, or less when the practice time left (free
 * plus paid) is shorter. With no time left, or where nothing is metered (local use), it's the
 * 10-minute limit: the recording is still kept in the tab, and time can be bought before it's
 * transcribed.
 */
export function recordingLimitMs(account: TimeLeft): number {
  if (!account?.metered) return MAX_RECORDING_MS
  const leftMs = (account.free_seconds_left + account.seconds_left) * 1000
  if (leftMs <= HELD_BACK_MS) return MAX_RECORDING_MS
  return Math.min(MAX_RECORDING_MS, leftMs - HELD_BACK_MS)
}

/** Whether the recording is capped by the practice time left rather than the 10-minute limit. */
export function limitedByTimeLeft(limitMs: number): boolean {
  return limitMs < MAX_RECORDING_MS
}
