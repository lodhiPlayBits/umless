import { describe, expect, it } from 'vitest'
import { classifyApiError } from '@/shared/api/apiErrors'
import { ApiError } from '@/shared/api/client'

const err = (status: number, code?: ConstructorParameters<typeof ApiError>[2]) => new ApiError('x', status, code)

describe('classifyApiError', () => {
  it('calls no answer at all unreachable', () => {
    expect(classifyApiError(err(0))).toBe('unreachable')
    expect(classifyApiError(new TypeError('boom'))).toBe('unreachable')
  })

  it('calls a 5xx without a code (the dev proxy) unreachable', () => {
    expect(classifyApiError(err(500))).toBe('unreachable')
    expect(classifyApiError(err(502))).toBe('unreachable')
  })

  it('calls a coded answer from the backend a server error, even a 500', () => {
    expect(classifyApiError(err(500, 'internal_error'))).toBe('server')
    expect(classifyApiError(err(404, 'not_found'))).toBe('server')
  })

  it('calls a 4xx without a code a server error: something answered', () => {
    expect(classifyApiError(err(404))).toBe('server')
  })

  it('calls validation_error validation', () => {
    expect(classifyApiError(err(422, 'validation_error'))).toBe('validation')
  })
})
