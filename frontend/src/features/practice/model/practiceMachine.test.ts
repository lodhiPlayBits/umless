import { describe, expect, it } from 'vitest'
import type { TranscribeFailure, Transcript } from '../api/practiceApi'
import { initialStage, practiceReducer, takeOf } from './practiceMachine'
import type { PracticeEvent, Stage, Take } from './practiceMachine'
import type { Recording } from './recorder'

const recording = (size = 10): Recording => ({ blob: new Blob(['x'.repeat(size)]), mimeType: 'audio/webm', durationMs: 65_000 }) as Recording
const take: Take = { recording: recording(), recordedAt: new Date(2026, 9, 30) }
const transcript = { text: 'hi', words: [], take_id: 't1' } as unknown as Transcript
const failure: TranscribeFailure = { title: 'Transcription failed', detail: 'Try again in a moment.', canRetry: true }

const stages: Record<Stage['name'], Stage> = {
  ready: { name: 'ready' },
  requesting: { name: 'requesting', showHint: false },
  'mic-error': { name: 'mic-error', kind: 'denied', message: 'no' },
  unsupported: { name: 'unsupported' },
  recording: { name: 'recording', startedAt: 1 },
  review: { name: 'review', take },
  empty: { name: 'empty' },
  transcribing: { name: 'transcribing', take },
  'transcribe-error': { name: 'transcribe-error', take, failure },
  result: { name: 'result', take, transcript },
}

const events: Record<PracticeEvent['type'], PracticeEvent> = {
  reset: { type: 'reset' },
  unsupported: { type: 'unsupported' },
  requestMic: { type: 'requestMic' },
  permissionSlow: { type: 'permissionSlow' },
  micFailed: { type: 'micFailed', kind: 'no-mic', message: 'none' },
  recordingStarted: { type: 'recordingStarted', startedAt: 42 },
  recordingFinished: { type: 'recordingFinished', recording: recording(), recordedAt: take.recordedAt, notice: 'limit' },
  transcribe: { type: 'transcribe' },
  transcribed: { type: 'transcribed', transcript },
  transcribeFailed: { type: 'transcribeFailed', failure },
  noAudio: { type: 'noAudio' },
}

/** [from, event] → the stage name it leads to. Every pair not listed must leave the stage as it is. */
const allowed: [Stage['name'], PracticeEvent['type'], Stage['name']][] = [
  ['ready', 'requestMic', 'requesting'],
  ['mic-error', 'requestMic', 'requesting'], // Try again
  ['requesting', 'permissionSlow', 'requesting'],
  ['requesting', 'micFailed', 'mic-error'],
  ['requesting', 'recordingStarted', 'recording'],
  ['recording', 'recordingFinished', 'review'],
  ['review', 'transcribe', 'transcribing'],
  ['transcribe-error', 'transcribe', 'transcribing'], // Try again
  ['transcribing', 'transcribed', 'result'],
  ['transcribing', 'transcribeFailed', 'transcribe-error'],
  ['transcribing', 'noAudio', 'empty'], // E12 empty_audio
]

describe('practiceReducer', () => {
  it.each(allowed)('%s + %s → %s', (from, event, to) => {
    expect(practiceReducer(stages[from], events[event]).name).toBe(to)
  })

  it('reset always goes back to ready, and unsupported always to unsupported', () => {
    for (const stage of Object.values(stages)) {
      expect(practiceReducer(stage, events.reset)).toEqual({ name: 'ready' })
      expect(practiceReducer(stage, events.unsupported)).toEqual({ name: 'unsupported' })
    }
  })

  it('ignores every other event: a late answer cannot overwrite where the user moved on to', () => {
    const changes = new Set(allowed.map(([from, event]) => `${from}+${event}`))
    for (const [name, stage] of Object.entries(stages)) {
      for (const [type, event] of Object.entries(events)) {
        if (type === 'reset' || type === 'unsupported' || changes.has(`${name}+${type}`)) continue
        expect(practiceReducer(stage, event), `${name} + ${type}`).toBe(stage)
      }
    }
  })

  it('a transcription that finishes after Record again does not show its result', () => {
    const afterRecordAgain = practiceReducer(stages.transcribing, events.reset)
    expect(practiceReducer(afterRecordAgain, events.transcribed)).toEqual({ name: 'ready' })
  })

  it('the permission hint only turns on while still waiting', () => {
    expect(practiceReducer(stages.requesting, events.permissionSlow)).toEqual({ name: 'requesting', showHint: true })
  })

  it('an empty recording is "nothing recorded" (E5), not a take', () => {
    const empty = { ...events.recordingFinished, recording: recording(0) } as PracticeEvent
    expect(practiceReducer(stages.recording, empty)).toEqual({ name: 'empty' })
  })

  it('a finished recording keeps the take, when it was made and why it stopped', () => {
    const next = practiceReducer(stages.recording, events.recordingFinished)
    expect(next).toMatchObject({ name: 'review', notice: 'limit', take: { recordedAt: take.recordedAt } })
  })

  it('transcribing, its error and its result all keep the same take', () => {
    const transcribing = practiceReducer(stages.review, events.transcribe)
    expect(takeOf(transcribing)).toBe(take)
    expect(takeOf(practiceReducer(transcribing, events.transcribeFailed))).toBe(take)
    expect(takeOf(practiceReducer(transcribing, events.transcribed))).toBe(take)
    expect(takeOf(stages.ready)).toBeNull()
  })

  it('starts ready, or unsupported when the browser cannot record (E3)', () => {
    expect(initialStage(true)).toEqual({ name: 'ready' })
    expect(initialStage(false)).toEqual({ name: 'unsupported' })
  })
})
