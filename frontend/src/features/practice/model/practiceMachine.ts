import type { TranscribeFailure, Transcript } from '../api/practiceApi'
import type { AutoStopReason, Recording } from './recorder'

/** One recording, with when it was made (for file names). */
export interface Take {
  recording: Recording
  recordedAt: Date
}

export type MicErrorKind = 'denied' | 'no-mic' | 'failed'

/**
 * Where a practice session is (docs/design/flows.md F3–F4, docs/design/v2/app-practice.html).
 * Each stage holds exactly the data its screen needs.
 */
export type Stage =
  | { name: 'ready' }
  | { name: 'requesting'; showHint: boolean }
  | { name: 'mic-error'; kind: MicErrorKind; message: string }
  | { name: 'unsupported' }
  | { name: 'recording'; startedAt: number }
  | { name: 'review'; take: Take; notice?: AutoStopReason }
  | { name: 'empty' }
  | { name: 'transcribing'; take: Take }
  | { name: 'transcribe-error'; take: Take; failure: TranscribeFailure }
  | { name: 'result'; take: Take; transcript: Transcript }

export type PracticeEvent =
  | { type: 'reset' }
  | { type: 'unsupported' }
  | { type: 'requestMic' }
  | { type: 'permissionSlow' }
  | { type: 'micFailed'; kind: MicErrorKind; message: string }
  | { type: 'recordingStarted'; startedAt: number }
  | { type: 'recordingFinished'; recording: Recording; recordedAt: Date; notice?: AutoStopReason }
  | { type: 'transcribe' }
  | { type: 'transcribed'; transcript: Transcript }
  | { type: 'transcribeFailed'; failure: TranscribeFailure }
  | { type: 'noAudio' }

export function initialStage(recordingSupported: boolean): Stage {
  return recordingSupported ? { name: 'ready' } : { name: 'unsupported' }
}

/** The take a stage carries, if any: review, transcribing, transcribe-error and result do. */
export function takeOf(stage: Stage): Take | null {
  return 'take' in stage ? stage.take : null
}

/**
 * The practice flow as a pure function. An event that doesn't fit the current stage is ignored
 * (returns the same stage), so a late answer can't overwrite what the user moved on to: a
 * transcription that finishes after "Record again" doesn't jump back to its result.
 */
export function practiceReducer(stage: Stage, event: PracticeEvent): Stage {
  switch (event.type) {
    case 'reset':
      return { name: 'ready' }
    case 'unsupported':
      return { name: 'unsupported' }
    case 'requestMic':
      return stage.name === 'ready' || stage.name === 'mic-error' ? { name: 'requesting', showHint: false } : stage
    case 'permissionSlow':
      return stage.name === 'requesting' ? { ...stage, showHint: true } : stage
    case 'micFailed':
      return stage.name === 'requesting' ? { name: 'mic-error', kind: event.kind, message: event.message } : stage
    case 'recordingStarted':
      return stage.name === 'requesting' ? { name: 'recording', startedAt: event.startedAt } : stage
    case 'recordingFinished':
      if (stage.name !== 'recording') return stage
      if (event.recording.blob.size === 0) return { name: 'empty' }
      return { name: 'review', take: { recording: event.recording, recordedAt: event.recordedAt }, notice: event.notice }
    case 'transcribe':
      return stage.name === 'review' || stage.name === 'transcribe-error' ? { name: 'transcribing', take: stage.take } : stage
    case 'transcribed':
      return stage.name === 'transcribing' ? { name: 'result', take: stage.take, transcript: event.transcript } : stage
    case 'transcribeFailed':
      return stage.name === 'transcribing' ? { name: 'transcribe-error', take: stage.take, failure: event.failure } : stage
    case 'noAudio':
      return stage.name === 'transcribing' ? { name: 'empty' } : stage
  }
}
