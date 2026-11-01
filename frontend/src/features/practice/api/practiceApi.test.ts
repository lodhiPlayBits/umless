import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/shared/api/client'
import { transcribeFailure, transcribeRecording } from './practiceApi'

const err = (status: number, code?: ConstructorParameters<typeof ApiError>[2]) => new ApiError('x', status, code)

describe('transcribeFailure', () => {
  it('maps status 0 to "Can\'t reach the umless server", retryable', () => {
    expect(transcribeFailure(err(0))).toMatchObject({ title: "Can't reach the umless server", canRetry: true })
  })

  it('maps a 5xx without a code (dev proxy) to "Can\'t reach the umless server"', () => {
    expect(transcribeFailure(err(502)).title).toBe("Can't reach the umless server")
    expect(transcribeFailure(err(500)).title).toBe("Can't reach the umless server")
  })

  it('maps 402 payment_required to "out of practice time", with a way to buy more', () => {
    expect(transcribeFailure(err(402, 'payment_required'))).toMatchObject({
      title: "You're out of practice time",
      canRetry: true,
      needsTime: true,
    })
  })

  it("shows the server's numbers when a recording is longer than the time left", () => {
    const error = new ApiError('This recording is 6 min; you have 4 min left. Buy more practice time to transcribe it.', 402, 'payment_required')
    expect(transcribeFailure(error)).toMatchObject({
      title: 'Not enough practice time for this recording',
      detail: 'This recording is 6 min; you have 4 min left. Buy more practice time to transcribe it. Your recording is safe in this tab.',
      needsTime: true,
    })
  })

  it('maps recording_too_long and unreadable_audio, with no pointless retry', () => {
    expect(transcribeFailure(err(400, 'recording_too_long'))).toMatchObject({ title: 'This recording is over 10 minutes', canRetry: false })
    expect(transcribeFailure(err(400, 'unreadable_audio'))).toMatchObject({ title: "This recording couldn't be read", canRetry: false })
  })

  it('maps 502 transcription_failed to "Transcription failed", retryable', () => {
    expect(transcribeFailure(err(502, 'transcription_failed'))).toMatchObject({ title: 'Transcription failed', canRetry: true })
  })

  it('maps 503 transcription_unavailable to "Transcription is unavailable"', () => {
    expect(transcribeFailure(err(503, 'transcription_unavailable')).title).toBe('Transcription is unavailable')
  })

  it('maps 413 audio_too_large to "over 25 MB" and not retryable', () => {
    expect(transcribeFailure(err(413, 'audio_too_large'))).toMatchObject({
      title: 'This recording is over 25 MB',
      canRetry: false,
    })
  })

  it('maps 409 transcription_in_progress to "still being transcribed", retryable', () => {
    expect(transcribeFailure(err(409, 'transcription_in_progress'))).toMatchObject({
      title: 'Another recording is still being transcribed',
      canRetry: true,
    })
  })

  it('maps 429 rate_limited to "a lot of recordings this hour", retryable', () => {
    expect(transcribeFailure(err(429, 'rate_limited'))).toMatchObject({
      title: "You've made a lot of recordings this hour",
      canRetry: true,
    })
  })

  it('treats a non-ApiError as unreachable', () => {
    expect(transcribeFailure(new TypeError('boom')).title).toBe("Can't reach the umless server")
  })
})

describe('transcribeFailure: no pointless retry', () => {
  it('offers no Try again for 415 unsupported_audio_type or 400 invalid_host', () => {
    expect(transcribeFailure(err(415, 'unsupported_audio_type')).canRetry).toBe(false)
    expect(transcribeFailure(err(400, 'invalid_host')).canRetry).toBe(false)
  })

  it('still offers Try again for an unexpected 500 internal_error', () => {
    expect(transcribeFailure(err(500, 'internal_error')).canRetry).toBe(true)
  })
})

describe('transcribeRecording', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs the raw audio with its content type and returns the transcript', async () => {
    const transcript = { text: 'um hi', words: [], duration_seconds: 1, summary: {} }
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(
      async () => new Response(JSON.stringify(transcript), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    // A native Blob: jsdom's Blob isn't one Node's Request can read, so it would send "[object Blob]".
    const audio = await new Response('abc', { headers: { 'Content-Type': 'audio/webm;codecs=opus' } }).blob()

    await expect(transcribeRecording(audio)).resolves.toEqual(transcript)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const request = fetchMock.mock.calls[0][0]
    expect(new URL(request.url).pathname).toBe('/api/transcriptions')
    expect(request.method).toBe('POST')
    expect(request.headers.get('Content-Type')).toBe('audio/webm;codecs=opus')
    expect(await request.text()).toBe('abc')
  })

  it('sends the question id, so the server saves the take, and none without one', async () => {
    const transcript = { text: '', words: [], duration_seconds: 1, summary: {}, take_id: 't1' }
    const fetchMock = vi.fn<(request: Request) => Promise<Response>>(async () => Response.json(transcript))
    vi.stubGlobal('fetch', fetchMock)
    const audio = new Blob(['a'], { type: 'audio/webm' })

    await expect(transcribeRecording(audio, 'q 1')).resolves.toMatchObject({ take_id: 't1' })
    await transcribeRecording(audio)

    expect(new URL(fetchMock.mock.calls[0][0].url).searchParams.get('questionId')).toBe('q 1')
    expect(new URL(fetchMock.mock.calls[1][0].url).search).toBe('')
  })

  it('rejects with an ApiError carrying the contract code', async () => {
    const body = { code: 'transcription_failed', detail: 'Transcription failed. Try again in a moment.' }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 502, headers: { 'Content-Type': 'application/json' } })))

    const error = await transcribeRecording(new Blob(['a'], { type: 'audio/webm' })).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, code: 'transcription_failed' })
  })
})
