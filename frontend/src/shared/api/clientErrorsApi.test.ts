import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendTokensFrom } from '@/shared/api/client'
import { sendClientError } from '@/shared/api/clientErrorsApi'
import type { ClientErrorReport } from '@/shared/api/clientErrorsApi'

const REPORT: ClientErrorReport = { kind: 'render', message: 'Error: boom', path: '/practice' }

function stubFetch(response = () => new Response(null, { status: 204 })) {
  const fetch = vi.fn(async () => response())
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  sendTokensFrom(null)
  vi.unstubAllGlobals()
})

describe('sendClientError', () => {
  it('posts the report with the session token when signed in', async () => {
    sendTokensFrom(async () => 'session-token')
    const fetch = stubFetch()

    await expect(sendClientError(REPORT)).resolves.toBe(true)
    const request = (fetch.mock.calls[0] as unknown as [Request])[0]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/api/client-errors')
    expect(request.headers.get('Authorization')).toBe('Bearer session-token')
    expect(await request.json()).toEqual(REPORT)
  })

  it.each([
    ['signed out', async () => null],
    ['the token source fails', async () => Promise.reject(new Error('clerk_offline'))],
  ])('sends nothing when %s', async (_, source) => {
    sendTokensFrom(source)
    const fetch = stubFetch()
    await expect(sendClientError(REPORT)).resolves.toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends nothing without a token source (local use)', async () => {
    const fetch = stubFetch()
    await expect(sendClientError(REPORT)).resolves.toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects when the server refuses the report', async () => {
    sendTokensFrom(async () => 'session-token')
    stubFetch(() => Response.json({ code: 'rate_limited', detail: 'Too many error reports this hour.' }, { status: 429 }))
    await expect(sendClientError(REPORT)).rejects.toMatchObject({ status: 429, code: 'rate_limited' })
  })
})
