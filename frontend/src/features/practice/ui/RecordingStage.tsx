import { useEffect, useRef, useState } from 'react'
import { MAX_RECORDING_MS } from '../model/recorder'
import { recordingLabel } from '@/shared/lib/timeLabel'
import { Banner, Button, Kbd } from '@/shared/ui'

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
      <section className="practice-stage" aria-label="Recording">
        <span className={reducedMotion ? 'rec-live rec-live--static' : 'rec-live'}>Recording</span>
        <div className={countdown ? 'rec-timer rec-timer--warning' : 'rec-timer'} role="timer" aria-label="Recording time">
          {recordingLabel(elapsed, maxMs)}
        </div>
        {hasMeter && !reducedMotion && (
          <div className="rec-meter meter" aria-hidden="true">
            {bars.map((value, index) => (
              // Square root: normal speech (0.1-0.4) fills a third to two thirds of the bar, not a sliver.
              <i key={index} style={{ height: `${Math.max(8, Math.round(Math.sqrt(value) * 100))}%` }} />
            ))}
          </div>
        )}
        <button type="button" className="record-button record-button--stop" onClick={onStop} aria-label="Stop recording">
          <span className="record-button__dot" aria-hidden="true" />
        </button>
        <p className="practice-stage__hint">
          Stop, or press <Kbd>Space</Kbd>
        </p>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel take
        </Button>
        <p className="ui-sr-only" aria-live="polite">
          {announcement}
        </p>
      </section>
      {quiet && (
        <Banner tone="warning" title="We can't hear you">
          The input has been silent for 5 s. Is the right microphone selected?
        </Banner>
      )}
    </>
  )
}
