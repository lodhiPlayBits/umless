import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { refreshAccountIfShown } from '@/features/billing'
import { ApiError } from '@/shared/api/client'
import { baseFileName } from '@/shared/lib/filenames'
import { navigate, useNavigationGuard } from '@/shared/lib/router'
import { useObjectUrl } from '@/shared/lib/useObjectUrl'
import type { ToastMessage } from '@/shared/ui/Toast'
import { transcribeFailure, transcribeRecording as realTranscribe } from '../api/practiceApi'
import type { PracticeQuestion } from '../api/practiceApi'
import { initialStage, practiceReducer, takeOf } from './practiceMachine'
import { RecorderError, extensionFor, isRecordingSupported, startRecording as realStartRecording } from './recorder'
import type { AutoStopReason, RecorderHandle, Recording } from './recorder'
import { invalidateTakes } from './useTakes'

/** The browser's permission prompt is only explained if it hasn't answered by then (F3.2). */
const PERMISSION_HINT_MS = 400
const RECORDING_TITLE = '● Recording · umless'

export interface PracticeDeps {
  startRecording?: typeof realStartRecording
  transcribe?: typeof realTranscribe
  now?: () => Date
}

/** Which "are you sure?" is open. 'again' as a leave target means Practise again on this page. */
export type PracticeDialog =
  | { kind: 'none' }
  | { kind: 'discard-recording'; target: string | null } // E15; null = Cancel take
  | { kind: 'leave-unsaved'; target: string } // E14
  | { kind: 'record-again' }

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('button, a, input, textarea, select, [contenteditable]')
}

/**
 * One practice session: the stage machine (practiceMachine.ts) wired to the recorder, the
 * transcription request, downloads, the navigation guard and the confirm dialogs. The views only
 * render what this returns and call its actions.
 */
export function usePracticeSession(practice: PracticeQuestion, deps: PracticeDeps = {}) {
  const { startRecording = realStartRecording, transcribe = realTranscribe } = deps
  const nowRef = useRef(deps.now ?? (() => new Date()))
  // E17: the question is a snapshot; edits elsewhere don't change this take or its file names.
  const [question] = useState(practice.question.text)
  const [stage, dispatch] = useReducer(practiceReducer, isRecordingSupported(), initialStage)
  const [dialog, setDialog] = useState<PracticeDialog>({ kind: 'none' })
  const [audioDownloaded, setAudioDownloaded] = useState(false)
  const [transcriptDownloaded, setTranscriptDownloaded] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const handleRef = useRef<RecorderHandle | null>(null)
  const stoppingRef = useRef(false)
  const mountedRef = useRef(true)

  const take = takeOf(stage)
  const audioUrl = useObjectUrl(take?.recording.blob ?? null)
  const baseName = take ? baseFileName(question, take.recordedAt) : ''
  const audioName = take ? `${baseName}.${extensionFor(take.recording.mimeType)}` : ''
  const downloadedAny = audioDownloaded || transcriptDownloaded

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

  const finish = useCallback((recording: Recording, notice?: AutoStopReason) => {
    handleRef.current = null
    stoppingRef.current = false
    if (!mountedRef.current) return
    // An auto-stop can land while "Stop and discard?" is open; that question no longer applies.
    setDialog((d) => (d.kind === 'discard-recording' ? { kind: 'none' } : d))
    setAudioDownloaded(false)
    setTranscriptDownloaded(false)
    dispatch({ type: 'recordingFinished', recording, recordedAt: nowRef.current(), notice })
  }, [])

  async function start() {
    if (!isRecordingSupported()) {
      dispatch({ type: 'unsupported' })
      return
    }
    dispatch({ type: 'requestMic' })
    const hint = window.setTimeout(() => dispatch({ type: 'permissionSlow' }), PERMISSION_HINT_MS)
    try {
      const handle = await startRecording({ onAutoStop: (recording, reason) => finish(recording, reason ?? 'device-lost') })
      if (!mountedRef.current) {
        void handle.stop()
        return
      }
      handleRef.current = handle
      dispatch({ type: 'recordingStarted', startedAt: Date.now() })
    } catch (error) {
      if (error instanceof RecorderError && error.kind === 'unsupported') dispatch({ type: 'unsupported' })
      else {
        const kind = error instanceof RecorderError && error.kind !== 'unsupported' ? error.kind : 'failed'
        dispatch({ type: 'micFailed', kind, message: error instanceof Error ? error.message : String(error) })
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

  async function runTranscription() {
    if (!take) return
    dispatch({ type: 'transcribe' })
    try {
      // The question id saves the transcript as a take of this question.
      const transcript = await transcribe(take.recording.blob, practice.question.id)
      if (mountedRef.current) dispatch({ type: 'transcribed', transcript })
      // The practice time shown went down, and this question has a new saved take.
      refreshAccountIfShown()
      if (transcript.take_id) void invalidateTakes()
    } catch (error) {
      if (!mountedRef.current) return
      if (error instanceof ApiError && error.code === 'empty_audio') dispatch({ type: 'noAudio' })
      else dispatch({ type: 'transcribeFailed', failure: transcribeFailure(error) })
    }
  }

  function recordAgain() {
    if (take && !audioDownloaded) setDialog({ kind: 'record-again' })
    else dispatch({ type: 'reset' })
  }

  function practiseAgain() {
    if (take && !downloadedAny) setDialog({ kind: 'leave-unsaved', target: 'again' })
    else dispatch({ type: 'reset' })
  }

  // Stable, so the recording stage's timer isn't restarted on every render.
  const readLevel = useCallback(() => handleRef.current?.level?.() ?? null, [])

  // E15: leaving while recording asks first. E14: so does leaving a take that nothing has been
  // downloaded from; it isn't stored anywhere else.
  const onBlockedRecording = useCallback((target: string) => setDialog({ kind: 'discard-recording', target }), [])
  const onBlockedUnsaved = useCallback((target: string) => setDialog({ kind: 'leave-unsaved', target }), [])
  useNavigationGuard(stage.name === 'recording' ? onBlockedRecording : take && !downloadedAny ? onBlockedUnsaved : null)

  function downloadAudioNow() {
    if (!audioUrl) return
    const link = document.createElement('a')
    link.href = audioUrl
    link.download = audioName
    link.click()
    setAudioDownloaded(true)
    setDialog({ kind: 'none' })
  }

  async function copyTranscript(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setToast({ id: Date.now(), text: 'Copied to clipboard' })
    } catch {
      setToast({ id: Date.now(), text: 'Select and copy the text instead' })
    }
  }

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

  const closeDialog = () => setDialog({ kind: 'none' })
  const dismissToast = useCallback(() => setToast(null), [])

  return {
    question,
    stage,
    take,
    audioUrl,
    audioName,
    baseName,
    dialog,
    toast,
    readLevel,
    actions: {
      start: () => void start(),
      stop: () => void stop(),
      cancelTake: () => setDialog({ kind: 'discard-recording', target: null }),
      transcribe: () => void runTranscription(),
      recordAgain,
      practiseAgain,
      reset: () => dispatch({ type: 'reset' }),
      audioDownloaded: () => setAudioDownloaded(true),
      transcriptDownloaded: () => setTranscriptDownloaded(true),
      copyTranscript: (text: string) => void copyTranscript(text),
      showToast: (text: string) => setToast({ id: Date.now(), text }),
      dismissToast,
    },
    dialogs: {
      close: closeDialog,
      downloadAudioNow,
      /** E14: leave the unsaved take for `target` ('again' = Practise again here). */
      leaveUnsaved(target: string) {
        closeDialog()
        if (target === 'again') dispatch({ type: 'reset' })
        else navigate(target, { force: true })
      },
      /** E15: Stop & review from the "still recording" question. */
      stopAndReview() {
        closeDialog()
        void stop()
      },
      /** E15: Discard, then go where the user was going (or back to ready for Cancel take). */
      discardRecording(target: string | null) {
        closeDialog()
        void discard().then(() => {
          if (target) navigate(target, { force: true })
          else if (mountedRef.current) dispatch({ type: 'reset' })
        })
      },
      confirmRecordAgain() {
        closeDialog()
        dispatch({ type: 'reset' })
      },
    },
  }
}

export type PracticeSessionState = ReturnType<typeof usePracticeSession>
