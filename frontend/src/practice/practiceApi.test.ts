import { describe, expect, it } from 'vitest'
import { ApiError } from '../client'
import { transcribeFailure } from './practiceApi'

const err = (status: number, code?: ConstructorParameters<typeof ApiError>[2]) => new ApiError('x', status, code)

describe('transcribeFailure', () => {
  it('maps status 0 to "Can\'t reach the umless server", retryable', () => {
    expect(transcribeFailure(err(0))).toMatchObject({ title: "Can't reach the umless server", canRetry: true })
  })

  it('maps a 5xx without a code (dev proxy) to "Can\'t reach the umless server"', () => {
    expect(transcribeFailure(err(502)).title).toBe("Can't reach the umless server")
    expect(transcribeFailure(err(500)).title).toBe("Can't reach the umless server")
  })

  it('maps 502 transcription_failed to "Transcription failed", retryable', () => {
    expect(transcribeFailure(err(502, 'transcription_failed'))).toMatchObject({ title: 'Transcription failed', canRetry: true })
  })

  it('maps 503 transcription_unavailable to "Transcription isn\'t set up"', () => {
    expect(transcribeFailure(err(503, 'transcription_unavailable')).title).toBe("Transcription isn't set up")
  })

  it('maps 413 audio_too_large to "over 25 MB" and not retryable', () => {
    expect(transcribeFailure(err(413, 'audio_too_large'))).toMatchObject({
      title: 'This recording is over 25 MB',
      canRetry: false,
    })
  })

  it('treats a non-ApiError as unreachable', () => {
    expect(transcribeFailure(new TypeError('boom')).title).toBe("Can't reach the umless server")
  })
})
