import { describe, expect, it } from 'vitest'
import { ApiError, unwrap } from './client'

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
