export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`
}

/** Elapsed time while recording; switches to a countdown in the final minute. */
export function recordingLabel(elapsedMs: number, maxMs: number): string {
  const remaining = maxMs - elapsedMs
  return remaining <= 60_000
    ? `Time left ${formatClock(Math.ceil(remaining / 1000) * 1000)}`
    : formatClock(elapsedMs)
}
