import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../client'
import ChoiceDialog from '../components/ChoiceDialog'
import ConfirmDialog from '../components/ConfirmDialog'
import { baseFileName } from '../filenames'
import Link from '../Link'
import { RecorderError, extensionFor, isRecordingSupported, startRecording as realStartRecording } from '../recorder'
import type { AutoStopReason, RecorderHandle, Recording } from '../recorder'
import { navigate, practicePath, useNavigationGuard } from '../router'
import { formatClock } from '../timeLabel'
import { useObjectUrl } from '../useObjectUrl'
import { transcribeFailure, transcribeRecording as realTranscribe } from './practiceApi'
import type { PracticeQuestion, TranscribeFailure, Transcript } from './practiceApi'
import RecordingStage from './RecordingStage'

/** The browser's permission prompt is only explained if it hasn't answered by then (F3.2). */
const PERMISSION_HINT_MS = 400
const RECORDING_TITLE = '● Recording · umless'

interface Take {
  recording: Recording
  recordedAt: Date
}

type Stage =
  | { name: 'ready' }
  | { name: 'requesting'; showHint: boolean }
  | { name: 'mic-error'; kind: 'denied' | 'no-mic' | 'failed'; message: string }
  | { name: 'unsupported' }
  | { name: 'recording'; startedAt: number }
  | { name: 'review'; take: Take; notice?: AutoStopReason }
  | { name: 'empty' }
  | { name: 'transcribing'; take: Take }
  | { name: 'transcribe-error'; take: Take; failure: TranscribeFailure }
  | { name: 'result'; take: Take; transcript: Transcript }

interface PracticeSessionProps {
  practice: PracticeQuestion
  serverUp: boolean | null
  startRecording?: typeof realStartRecording
  transcribe?: typeof realTranscribe
  now?: () => Date
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('button, a, input, textarea, select, [contenteditable]')
}

export default function PracticeSession({
  practice,
  serverUp,
  startRecording = realStartRecording,
  transcribe = realTranscribe,
  now = () => new Date(),
}: PracticeSessionProps) {
  // E17: the question is a snapshot; edits elsewhere don't change this take or its file names.
  const [question] = useState(practice.question.text)
  const [stage, setStage] = useState<Stage>(() => (isRecordingSupported() ? { name: 'ready' } : { name: 'unsupported' }))
  const [leaveTarget, setLeaveTarget] = useState<string | null | undefined>(undefined) // undefined = no dialog; null = Cancel take
  const [confirmRecordAgain, setConfirmRecordAgain] = useState(false)
  const [audioDownloaded, setAudioDownloaded] = useState(false)
  const handleRef = useRef<RecorderHandle | null>(null)
  const stoppingRef = useRef(false)
  const mountedRef = useRef(true)

  const take = 'take' in stage ? stage.take : null
  const audioUrl = useObjectUrl(take?.recording.blob ?? null)
  const audioName = take
    ? `${baseFileName(question, take.recordedAt)}.${extensionFor(take.recording.mimeType)}`
    : ''

  // Release the microphone if the page goes away mid-recording.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void handleRef.current?.stop()
      handleRef.current = null
    }
  }, [])

  // F3.3 / E18: the tab title shows that the microphone is live.
  useEffect(() => {
    if (stage.name !== 'recording') return
    const previous = document.title
    document.title = RECORDING_TITLE
    return () => {
      document.title = previous
    }
  }, [stage.name])

  const finish = useCallback(
    (recording: Recording, notice?: AutoStopReason) => {
      handleRef.current = null
      stoppingRef.current = false
      if (!mountedRef.current) return
      setAudioDownloaded(false)
      if (recording.blob.size === 0) setStage({ name: 'empty' })
      else setStage({ name: 'review', take: { recording, recordedAt: now() }, notice })
    },
    [now],
  )

  async function start() {
    if (!isRecordingSupported()) {
      setStage({ name: 'unsupported' })
      return
    }
    setStage({ name: 'requesting', showHint: false })
    const hint = window.setTimeout(
      () => setStage((s) => (s.name === 'requesting' ? { ...s, showHint: true } : s)),
      PERMISSION_HINT_MS,
    )
    try {
      const handle = await startRecording({ onAutoStop: (recording, reason) => finish(recording, reason ?? 'device-lost') })
      if (!mountedRef.current) {
        void handle.stop()
        return
      }
      handleRef.current = handle
      setStage({ name: 'recording', startedAt: Date.now() })
    } catch (error) {
      if (error instanceof RecorderError && error.kind === 'unsupported') setStage({ name: 'unsupported' })
      else {
        const kind = error instanceof RecorderError && error.kind !== 'unsupported' ? error.kind : 'failed'
        setStage({ name: 'mic-error', kind, message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      window.clearTimeout(hint)
    }
  }

  /** E7: a second Stop (or Stop racing the auto-stop) is ignored. */
  async function stop() {
    const handle = handleRef.current
    if (!handle || stoppingRef.current) return
    stoppingRef.current = true
    finish(await handle.stop())
  }

  async function discard() {
    const handle = handleRef.current
    handleRef.current = null
    if (handle) await handle.stop()
    stoppingRef.current = false
  }

  async function runTranscription(current: Take) {
    setStage({ name: 'transcribing', take: current })
    try {
      const transcript = await transcribe(current.recording.blob)
      if (mountedRef.current) setStage({ name: 'result', take: current, transcript })
    } catch (error) {
      if (!mountedRef.current) return
      if (error instanceof ApiError && error.code === 'empty_audio') setStage({ name: 'empty' })
      else setStage({ name: 'transcribe-error', take: current, failure: transcribeFailure(error) })
    }
  }

  function recordAgain() {
    if (take && !audioDownloaded) setConfirmRecordAgain(true)
    else setStage({ name: 'ready' })
  }

  // Stable, so the recording stage's timer isn't restarted on every render.
  const readLevel = useCallback(() => handleRef.current?.level?.() ?? null, [])

  // E15: leaving (or "Cancel take") while recording asks first.
  const onBlocked = useCallback((path: string) => setLeaveTarget(path), [])
  useNavigationGuard(stage.name === 'recording' ? onBlocked : null)

  // E22: Space starts and stops recording when focus isn't on a control.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== ' ' || event.repeat || isTyping(event.target) || document.querySelector('[role="alertdialog"]')) return
      if (stage.name === 'ready') {
        event.preventDefault()
        void start()
      } else if (stage.name === 'recording') {
        event.preventDefault()
        void stop()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const { number, total, nextId } = practice

  return (
    <>
      {stage.name === 'ready' && (
        <div className="crumb muted">
          <span>
            Question {number} of {total}
          </span>
          {nextId && <Link to={practicePath(nextId)}>Next question →</Link>}
        </div>
      )}
      <h1 className="question">{question}</h1>

      {stage.name === 'ready' && (
        <>
          <p className="muted">
            Answer out loud as if it were the real thing. You'll see every "um", "uh" and long pause afterwards.
          </p>
          <div className="stage">
            <button type="button" className="big-record" onClick={() => void start()} aria-label="Start recording">
              <span className="dot" aria-hidden="true" />
              Start
            </button>
            <p className="hint">
              Up to 10 minutes · Press <kbd>Space</kbd> to start
            </p>
          </div>
          <p className="privacy">
            🔒 Your recording stays in this browser tab until you transcribe it. It's then sent to Deepgram for
            transcription only, not used for training, and nothing is saved on our server. Download anything you want to
            keep.
          </p>
          {serverUp === false && (
            <div className="banner warn small" role="status">
              <span aria-hidden="true">⚠</span>
              <div>
                <strong>Server offline</strong>
                You can record and download, but not transcribe until the backend is running.
              </div>
            </div>
          )}
        </>
      )}

      {stage.name === 'requesting' && (
        <div className="stage" role="status">
          {stage.showHint && (
            <>
              <p className="big-arrow" aria-hidden="true">
                ↖
              </p>
              <p>
                <strong>Allow microphone access</strong>
              </p>
              <p className="muted small">
                Your browser is asking for permission at the top of the window. Choose <strong>Allow</strong>.
              </p>
            </>
          )}
        </div>
      )}

      {stage.name === 'mic-error' && <MicError kind={stage.kind} message={stage.message} onRetry={() => void start()} />}

      {stage.name === 'unsupported' && (
        <div className="empty">
          <p className="big-icon" aria-hidden="true">
            🎙
          </p>
          <p>
            <strong>This browser can't record audio</strong>
          </p>
          <p className="muted small">
            Open umless in a current version of Chrome, Edge or Firefox, at <code>http://localhost:5173</code>.
          </p>
          <Link to="/" className="btn">
            Back to questions
          </Link>
        </div>
      )}

      {stage.name === 'recording' && (
        <RecordingStage
          startedAt={stage.startedAt}
          level={readLevel}
          onStop={() => void stop()}
          onCancel={() => setLeaveTarget(null)}
        />
      )}

      {stage.name === 'empty' && (
        <div className="empty">
          <p>
            <strong>Nothing was recorded</strong>
          </p>
          <p className="muted small">Check that the right microphone is selected and isn't muted, then try again.</p>
          <button type="button" className="btn btn-primary" onClick={() => setStage({ name: 'ready' })}>
            Record again
          </button>
        </div>
      )}

      {take && audioUrl && (stage.name === 'review' || stage.name === 'transcribing' || stage.name === 'transcribe-error') && (
        <>
          {stage.name === 'review' && stage.notice === 'limit' && (
            <div className="banner info small" role="status">
              <span aria-hidden="true">ℹ</span>
              <div>
                <strong>Stopped at the 10-minute limit</strong>
              </div>
            </div>
          )}
          {stage.name === 'review' && stage.notice === 'device-lost' && (
            <div className="banner warn small" role="alert">
              <span aria-hidden="true">⚠</span>
              <div>
                <strong>Recording stopped: the microphone was disconnected</strong>
                We kept the {formatClock(take.recording.durationMs)} you recorded.
              </div>
            </div>
          )}
          <div className="player">
            <audio controls src={audioUrl} aria-label="Your recording" />
            <span className="time">{formatClock(take.recording.durationMs)}</span>
          </div>

          {stage.name === 'transcribing' && (
            <div className="stage" role="status" aria-live="polite">
              <div className="spinner" aria-hidden="true" />
              <p>
                <strong>Transcribing…</strong>
              </p>
              <p className="muted small">Usually a few seconds.</p>
            </div>
          )}

          {stage.name === 'transcribe-error' && (
            <div className="banner error" role="alert">
              <span aria-hidden="true">⚠</span>
              <div>
                <strong>{stage.failure.title}</strong>
                <span className="small">{stage.failure.detail}</span>
              </div>
            </div>
          )}

          {stage.name === 'review' && <p className="hint">Not saved anywhere yet. Transcribe it, or download the audio to keep it.</p>}

          {stage.name !== 'transcribing' && (
            <div className="bottom-bar">
              {(stage.name === 'review' || stage.failure.canRetry) && (
                <button type="button" className="btn btn-primary" onClick={() => void runTranscription(take)}>
                  {stage.name === 'review' ? 'Transcribe' : 'Try again'}
                </button>
              )}
              <button type="button" className="btn" onClick={recordAgain}>
                Record again
              </button>
              <a className="btn" href={audioUrl} download={audioName} onClick={() => setAudioDownloaded(true)}>
                ⬇ Audio
              </a>
            </div>
          )}
        </>
      )}

      {stage.name === 'result' && (
        // Screen 8 (result) fills this in: summary, highlighted transcript, downloads.
        <article className="card transcript">
          <h2>Transcript</h2>
          <p className="body">{stage.transcript.text}</p>
        </article>
      )}

      {leaveTarget !== undefined && (
        <ChoiceDialog
          title="Stop and discard this recording?"
          choices={[
            { label: 'Keep recording', onClick: () => setLeaveTarget(undefined) },
            {
              label: 'Stop & review',
              onClick: () => {
                setLeaveTarget(undefined)
                void stop()
              },
            },
            {
              label: 'Discard',
              style: 'danger',
              onClick: () => {
                const target = leaveTarget
                setLeaveTarget(undefined)
                void discard().then(() => {
                  if (target) navigate(target, { force: true })
                  else if (mountedRef.current) setStage({ name: 'ready' })
                })
              },
            },
          ]}
        >
          <p>You're still recording.</p>
        </ChoiceDialog>
      )}

      {confirmRecordAgain && (
        <ConfirmDialog
          title="Record again?"
          confirmLabel="Record again"
          danger
          onCancel={() => setConfirmRecordAgain(false)}
          onConfirm={() => {
            setConfirmRecordAgain(false)
            setStage({ name: 'ready' })
          }}
        >
          <p>This recording isn't saved anywhere. Download the audio first if you want to keep it.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

function MicError({ kind, message, onRetry }: { kind: 'denied' | 'no-mic' | 'failed'; message: string; onRetry: () => void }) {
  return (
    <div className="banner error" role="alert">
      <span aria-hidden="true">🎙</span>
      <div>
        {kind === 'denied' && (
          <>
            <strong>umless needs your microphone</strong>
            <ol className="small steps">
              <li>Click the lock or tune icon left of the address bar.</li>
              <li>
                Set <strong>Microphone</strong> to <strong>Allow</strong>.
              </li>
              <li>
                Come back and press <strong>Try again</strong>.
              </li>
            </ol>
          </>
        )}
        {kind === 'no-mic' && (
          <>
            <strong>No microphone found</strong>
            <span className="small">
              Plug in a headset or check that your microphone is enabled in your system sound settings, then try again.
            </span>
          </>
        )}
        {kind === 'failed' && (
          <>
            <strong>The microphone couldn't start</strong>
            <span className="small">{message}. Close other apps that use the microphone, then try again.</span>
          </>
        )}
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
          <Link to="/" className="btn">
            Back to questions
          </Link>
        </div>
      </div>
    </div>
  )
}
