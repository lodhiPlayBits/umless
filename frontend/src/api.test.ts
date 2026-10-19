import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, transcribe } from './api'

const result = {
  text: 'hello world',
  words: [{ word: 'hello', start: 0, end: 0.5, confidence: 0.9 }],
  duration_seconds: 1.5,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('transcribe', () => {
  it('POSTs the audio blob with its content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(result))
    vi.stubGlobal('fetch', fetchMock)
    const audio = new Blob(['abc'], { type: 'audio/webm' })

    await transcribe(audio)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/transcriptions')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'audio/webm' })
    expect(init.body).toBe(audio)
  })

  it('returns the parsed JSON on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(result)))
    await expect(transcribe(new Blob(['a'], { type: 'audio/webm' }))).resolves.toEqual(result)
  })

  it('throws ApiError with the string detail and status on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ detail: 'Bad audio' }, 415)))
    const error = await transcribe(new Blob(['a'], { type: 'audio/webm' })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(415)
    expect((error as ApiError).message).toBe('Bad audio')
  })

  it('uses a generic message when detail is not a string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: [{ msg: 'x' }] }, 422)),
    )
    const error = await transcribe(new Blob(['a'], { type: 'audio/webm' })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(422)
    expect((error as ApiError).message).toBe('Request failed (422)')
  })

  it('uses a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 500 })))
    const error = await transcribe(new Blob(['a'], { type: 'audio/webm' })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(500)
    expect((error as ApiError).message).toBe('Request failed (500)')
  })

  it('throws ApiError with status 0 when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const error = await transcribe(new Blob(['a'], { type: 'audio/webm' })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
    expect((error as ApiError).message).toBe('Could not reach the server')
  })
})
