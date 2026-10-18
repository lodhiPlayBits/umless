// Regression test for the Phase 2 code review: a bad 200 body becomes a readable ApiError.
import { afterEach, expect, it, vi } from 'vitest'
import { ApiError, transcribe } from './api'

afterEach(() => vi.unstubAllGlobals())

it.each([
  ['non-JSON body', new Response('<html>proxy error</html>', { status: 200 })],
  ['JSON without text', new Response(JSON.stringify({ words: [] }), { status: 200 })],
])('turns a 200 with a %s into an ApiError', async (_label, response) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

  const error = await transcribe(new Blob(['a'], { type: 'audio/webm' })).catch((e: unknown) => e)

  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).message).toBe('Unexpected response from the server')
})
