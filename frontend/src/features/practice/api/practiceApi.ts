import { UNREACHABLE_TITLE, classifyApiError } from '@/shared/api/apiErrors'
import { ApiError, client, unwrap } from '@/shared/api/client'
import type { Question } from '@/features/questions'
import type { Transcript } from '@/features/takes'

export type { Transcript }

export interface PracticeQuestion {
  question: Question
  /** 1-based position in the list, for "Question 2 of 5". */
  number: number
  total: number
  nextId: string | null
}

/**
 * The practice route loads the whole list (docs/api/openapi.yaml listQuestions) so the
 * question, its position and the next question come from one consistent read.
 * Resolves to null when no question has this id.
 */
export async function loadPracticeQuestion(questionId: string, signal?: AbortSignal): Promise<PracticeQuestion | null> {
  const { items } = await unwrap(client.GET('/api/questions', { signal }))
  const index = items.findIndex((q) => q.id === questionId)
  if (index === -1) return null
  return { question: items[index], number: index + 1, total: items.length, nextId: items[index + 1]?.id ?? null }
}

/** False when the backend can't be reached; recording still works, transcribing won't. */
export async function isServerUp(signal?: AbortSignal): Promise<boolean> {
  try {
    await unwrap(client.GET('/api/health', { signal }))
    return true
  } catch {
    return false
  }
}

/** With a questionId, the server also saves the transcript as a take of that question (`take_id`). */
export function transcribeRecording(audio: Blob, questionId?: string): Promise<Transcript> {
  return unwrap(
    client.POST('/api/transcriptions', {
      params: { query: questionId === undefined ? {} : { questionId } },
      // The contract types the raw audio body as a binary string; send the Blob unchanged.
      body: audio as unknown as string,
      bodySerializer: (body) => body as unknown as Blob,
      headers: { 'Content-Type': audio.type || 'audio/webm' },
    }),
  )
}

export interface TranscribeFailure {
  title: string
  detail: string
  /** False when trying the same recording again can't help (too large, or not set up). */
  canRetry: boolean
  /** Out of practice time: offer to buy more, then Try again. */
  needsTime?: boolean
}

/** One message per cause (docs/design/flows.md E8–E11, wireframe practice-transcribe-error). */
export function transcribeFailure(error: unknown): TranscribeFailure {
  const status = error instanceof ApiError ? error.status : 0
  const code = error instanceof ApiError ? error.code : undefined
  if (classifyApiError(error) === 'unreachable') {
    return {
      title: UNREACHABLE_TITLE,
      detail: 'Your recording is safe in this tab. Check your connection, then try again.',
      canRetry: true,
    }
  }
  if (code === 'transcription_failed') {
    return { title: 'Transcription failed', detail: 'Try again in a moment.', canRetry: true }
  }
  if (code === 'transcription_unavailable') {
    return {
      title: 'Transcription is unavailable',
      detail: 'Our speech-to-text service is down for a moment. Your recording is safe: try again later, or download the audio.',
      canRetry: true,
    }
  }
  if (code === 'payment_required') {
    // The server says how long the recording is and how much time is left.
    const server = error instanceof ApiError && error.message.startsWith('This recording') ? `${error.message} ` : ''
    return {
      title: server ? 'Not enough practice time for this recording' : "You're out of practice time",
      detail: `${server || 'Buy more time, then press Try again. '}Your recording is safe in this tab.`,
      canRetry: true,
      needsTime: true,
    }
  }
  if (code === 'free_time_paused') {
    // The site-wide daily cap on free time is used up; paid time still works.
    return {
      title: 'Free practice is paused for today',
      detail: "A lot of people are practising today. Free time is back after midnight, or buy a session to keep going now. Your recording is safe in this tab.",
      canRetry: true,
      needsTime: true,
    }
  }
  if (code === 'recording_too_long') {
    return { title: 'This recording is over 10 minutes', detail: 'Record a shorter answer. Your recording is still in this tab to download.', canRetry: false }
  }
  if (code === 'unreadable_audio') {
    return { title: "This recording couldn't be read", detail: 'Record it again. If it keeps happening, try another browser.', canRetry: false }
  }
  if (code === 'transcription_in_progress') {
    return {
      title: 'Another recording is still being transcribed',
      detail: 'Wait for it to finish (it may be in another tab), then try again. This recording is safe.',
      canRetry: true,
    }
  }
  if (code === 'rate_limited') {
    return {
      title: "You've made a lot of recordings this hour",
      detail: 'Take a short break, then try again. This recording is safe in this tab.',
      canRetry: true,
    }
  }
  if (code === 'audio_too_large') {
    return { title: 'This recording is over 25 MB', detail: 'Record a shorter answer.', canRetry: false }
  }
  // Sending the same take again can't fix these.
  const retryable = code !== 'unsupported_audio_type' && code !== 'invalid_host'
  return {
    title: 'Something went wrong',
    detail: `The server answered with code ${status}. Download the audio so you don't lose it.`,
    canRetry: retryable,
  }
}
