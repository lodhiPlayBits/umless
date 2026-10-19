import { useEffect, useRef, useState } from 'react'
import { MAX_RECORDING_MS } from '../recorder'
import { recordingLabel } from '../timeLabel'

const TICK_MS = 250
const METER_BARS = 9
const QUIET_LEVEL = 0.02
/** E6: hint after this long without any sound. */
export const QUIET_HINT_MS = 5000

interface RecordingStageProps {
  startedAt: number
  /** Input level 0–1, or null if the browser can't measure it (then there's no meter or quiet hint). */
  level: () => number | null
  onStop: () => void
  onCancel: () => void
  maxMs?: number
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** F3.3–3.4: live timer (countdown in the final minute), level meter, quiet-input hint. */
export default function RecordingStage({ startedAt, level, onStop, onCancel, maxMs = MAX_RECORDING_MS }: RecordingStageProps) {
  const [elapsed, setElapsed] = useState(0)
  const [bars, setBars] = useState<number[]>(() => Array(METER_BARS).fill(0))
  const [quiet, setQuiet] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const lastSound = useRef(Date.now())
  const announced = useRef({ minute: false, tenSeconds: false })
  const [reducedMotion] = useState(prefersReducedMotion)

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      const ms = now - startedAt
      setElapsed(ms)
      const remaining = maxMs - ms
      if (remaining <= 60_000 && !announced.current.minute) {
        announced.current.minute = true
        setAnnouncement('1 minute left')
      }
      if (remaining <= 10_000 && !announced.current.tenSeconds) {
        announced.current.tenSeconds = true
        setAnnouncement('10 seconds left')
      }
      const value = level()
      if (value === null) return
      if (value > QUIET_LEVEL) lastSound.current = now
      setQuiet(now - lastSound.current >= QUIET_HINT_MS)
      setBars((previous) => [...previous.slice(1), value])
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [startedAt, maxMs, level])

  const countdown = maxMs - elapsed <= 60_000
  const hasMeter = level() !== null

  return (
    <>
      <div className="stage">
        <span className={reducedMotion ? 'live static' : 'live'}>Recording</span>
        <div className={countdown ? 'timer warn' : 'timer'} role="timer" aria-label="Recording time">
          {recordingLabel(elapsed, maxMs)}
        </div>
        {hasMeter && !reducedMotion && (
          <div className="meter" aria-hidden="true">
            {bars.map((value, index) => (
              <i key={index} style={{ height: `${Math.max(8, Math.round(value * 100))}%` }} />
            ))}
          </div>
        )}
        <button type="button" className="big-record stop" onClick={onStop} aria-label="Stop recording">
          <span className="dot" aria-hidden="true" />
          Stop
        </button>
        <p className="hint">
          Press <kbd>Space</kbd> to stop
        </p>
        <p className="visually-hidden" aria-live="polite">
          {announcement}
        </p>
      </div>
      <div className="actions centered">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel take
        </button>
      </div>
      {quiet && (
        <div className="banner warn small" role="status">
          <span aria-hidden="true">🔇</span>
          <div>
            <strong>We can't hear you</strong>
            The input has been silent for 5 s. Is the right microphone selected?
          </div>
        </div>
      )}
    </>
  )
}
