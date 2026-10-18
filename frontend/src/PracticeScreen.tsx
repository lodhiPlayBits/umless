import { useEffect, useMemo, useRef, useState } from 'react'
import { transcribe as realTranscribe } from './api'
import type { TranscriptResult } from './api'
import { baseFileName, transcriptText } from './filenames'
import {
  MAX_RECORDING_MS,
  extensionFor,
  startRecording as realStartRecording,
} from './recorder'
import type { RecorderHandle, Recording } from './recorder'
import { recordingLabel } from './timeLabel'

type Phase = 'idle' | 'starting' | 'recording' | 'recorded' | 'transcribing' | 'done'

interface Props {
  startRecording?: typeof realStartRecording
  transcribe?: typeof realTranscribe
  now?: () => Date
}

/**
 * Object URL for the blob, available on the same render. Revoked when the blob changes or on
 * unmount; the revoke is deferred so StrictMode's simulated unmount/remount can cancel it.
 */
function useObjectUrl(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob])
  const pendingRevoke = useRef<{ url: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  useEffect(() => {
    if (pendingRevoke.current?.url === url) clearTimeout(pendingRevoke.current.timer)
    return () => {
      if (!url) return
      pendingRevoke.current = { url, timer: setTimeout(() => URL.revokeObjectURL(url), 0) }
    }
  }, [url])
  return url
}

export default function PracticeScreen({
  startRecording = realStartRecording,
  transcribe = realTranscribe,
  now = () => new Date(),
}: Props) {
  const [question, setQuestion] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [recordedAt, setRecordedAt] = useState<Date | null>(null)
  const [result, setResult] = useState<{ text: string; txt: Blob } | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const handleRef = useRef<RecorderHandle | null>(null)
  const mountedRef = useRef(true)

  const audioUrl = useObjectUrl(recording?.blob ?? null)
  const transcriptUrl = useObjectUrl(result?.txt ?? null)
  const baseName = recordedAt ? baseFileName(question, recordedAt) : ''

  useEffect(() => {
    if (phase !== 'recording') return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    return () => clearInterval(timer)
  }, [phase])

  // Release the microphone if the screen goes away mid-recording.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void handleRef.current?.stop()
      handleRef.current = null
    }
  }, [])

  function finishRecording(rec: Recording) {
    handleRef.current = null
    setRecording(rec)
    setRecordedAt(now())
    setPhase('recorded')
  }

  async function handleStart() {
    setError(null)
    setElapsedMs(0)
    setPhase('starting')
    try {
      const handle = await startRecording({ onAutoStop: finishRecording })
      if (!mountedRef.current) {
        void handle.stop()
        return
      }
      handleRef.current = handle
      setPhase('recording')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start recording')
      setPhase('idle')
    }
  }

  async function handleStop() {
    const handle = handleRef.current
    if (!handle) return
    try {
      finishRecording(await handle.stop())
    } catch (e) {
      handleRef.current = null
      setError(e instanceof Error ? e.message : 'Could not stop recording')
      setPhase('idle')
    }
  }

  async function handleTranscribe() {
    if (!recording) return
    setError(null)
    setPhase('transcribing')
    try {
      const transcript: TranscriptResult = await transcribe(recording.blob)
      setResult({
        text: transcript.text,
        txt: new Blob([transcriptText(question, transcript.text)], { type: 'text/plain' }),
      })
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not transcribe audio')
      setPhase('recorded')
    }
  }

  function handleReset() {
    setRecording(null)
    setRecordedAt(null)
    setResult(null)
    setError(null)
    setPhase('idle')
  }

  const isEmpty = recording !== null && recording.blob.size === 0
  const hasRecording = phase === 'recorded' || phase === 'transcribing' || phase === 'done'

  return (
    <section>
      <label>
        Question
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={phase === 'recording' || phase === 'transcribing'}
        />
      </label>

      {(phase === 'idle' || phase === 'starting') && (
        <button type="button" onClick={handleStart} disabled={phase === 'starting'}>
          Start recording
        </button>
      )}

      {phase === 'recording' && (
        <>
          <p aria-live="polite">Recording {recordingLabel(elapsedMs, MAX_RECORDING_MS)}</p>
          <button type="button" onClick={handleStop}>
            Stop recording
          </button>
        </>
      )}

      {hasRecording && recording && (
        <>
          {audioUrl && <audio controls src={audioUrl} />}
          {isEmpty && <p>Recording is empty</p>}
          <div>
            {phase !== 'done' && (
              <button
                type="button"
                onClick={handleTranscribe}
                disabled={isEmpty || phase === 'transcribing'}
              >
                Transcribe
              </button>
            )}
            <button type="button" onClick={handleReset} disabled={phase === 'transcribing'}>
              Record again
            </button>
          </div>
          {phase === 'transcribing' && <p aria-live="polite">Transcribing…</p>}
          {audioUrl && !isEmpty && (
            <p>
              <a href={audioUrl} download={`${baseName}.${extensionFor(recording.mimeType)}`}>
                Download audio
              </a>
            </p>
          )}
        </>
      )}

      {phase === 'done' && result && (
        <article>
          <h2>Transcript</h2>
          <p>{result.text}</p>
          {transcriptUrl && (
            <a href={transcriptUrl} download={`${baseName}.txt`}>
              Download transcript
            </a>
          )}
        </article>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  )
}
