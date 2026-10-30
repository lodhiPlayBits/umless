import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, client, sendTokensFrom, unwrap } from '@/shared/api/client'

const result = (status: number, extra: { data?: unknown; error?: unknown } = {}) =>
  Promise.resolve({ ...extra, response: new Response(null, { status }) })

/** The error a promise rejects with; fails the test if it resolves instead. */
const rejection = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('expected a rejection')
    },
    (e: unknown) => e as ApiError,
  )

describe('unwrap', () => {
  it('returns the data on success', async () => {
    await expect(unwrap(result(200, { data: { items: [1] } }))).resolves.toEqual({ items: [1] })
  })

  it('throws an ApiError carrying detail, status, code and fields from an error body', async () => {
    const fields = [{ field: 'text', message: 'Too long' }]
    const error = { detail: 'Invalid', code: 'validation_error', fields }
    const err = await rejection(unwrap(result(422, { error })))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe('Invalid')
    expect(err.status).toBe(422)
    expect(err.code).toBe('validation_error')
    expect(err.fields).toEqual(fields)
  })

  it('throws an ApiError without a code for a non-JSON 5xx', async () => {
    const err = await rejection(unwrap(result(502, { error: 'Bad gateway html' })))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(502)
    expect(err.code).toBeUndefined()
  })

  it('throws an ApiError with status 0 when the fetch throws', async () => {
    const err = await rejection(unwrap(Promise.reject(new TypeError('Failed to fetch'))))
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
  })
})

describe('sendTokensFrom', () => {
  /** Calls the API with fetch stubbed; resolves to the Authorization header it was sent with. */
  async function authorizationSent() {
    const fetch = vi.fn(async () => Response.json({ status: 'ok' }))
    vi.stubGlobal('fetch', fetch)
    await client.GET('/api/health')
    const request = (fetch.mock.calls[0] as unknown as [Request])[0]
    return request.headers.get('Authorization')
  }

  afterEach(() => {
    sendTokensFrom(null)
    vi.unstubAllGlobals()
  })

  it('sends no Authorization header without a token source (local use)', async () => {
    expect(await authorizationSent()).toBeNull()
  })

  it('sends the current session token as a Bearer token', async () => {
    sendTokensFrom(async () => 'session-token')
    expect(await authorizationSent()).toBe('Bearer session-token')
  })

  it('asks for the token on every request, so a refreshed token is used', async () => {
    let n = 0
    sendTokensFrom(async () => `token-${++n}`)
    expect(await authorizationSent()).toBe('Bearer token-1')
    expect(await authorizationSent()).toBe('Bearer token-2')
  })

  it('sends no header while signed out (the source returns null)', async () => {
    sendTokensFrom(async () => null)
    expect(await authorizationSent()).toBeNull()
  })

  it('reports a failing token source as an unreachable server, not a crash', async () => {
    sendTokensFrom(async () => {
      throw new Error('clerk_offline')
    })
    const err = await rejection(unwrap(client.GET('/api/health')))
    expect(err.status).toBe(0)
  })
})
