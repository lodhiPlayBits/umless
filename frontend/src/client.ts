import createClient from 'openapi-fetch'
import type { components, paths } from './generated/openapi'

export type ErrorBody = components['schemas']['Error']
export type ErrorCode = components['schemas']['ErrorCode']
export type FieldError = components['schemas']['FieldError']

// Typed client for docs/api/openapi.yaml. In the browser the base URL is the page's origin, so
// requests go through the Vite proxy (same origin, no CORS).
export const client = createClient<paths>({
  baseUrl: globalThis.location?.origin ?? '',
  // Look fetch up on every call so tests can stub it after this module is imported.
  fetch: (request) => globalThis.fetch(request),
})

type TokenSource = () => Promise<string | null>
let tokenSource: TokenSource | null = null

/**
 * Sign every request with the session token from `source` (Clerk's getToken, which refreshes
 * it before it expires). Never set without sign-in: local use and tests send no token.
 */
export function sendTokensFrom(source: TokenSource | null) {
  tokenSource = source
}

client.use({
  async onRequest({ request }) {
    const token = await tokenSource?.()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
})

export class ApiError extends Error {
  name = 'ApiError'
  /** HTTP status; 0 means the server couldn't be reached. */
  status: number
  code?: ErrorCode
  fields?: FieldError[]

  constructor(message: string, status: number, code?: ErrorCode, fields?: FieldError[]) {
    super(message)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

function isErrorBody(body: unknown): body is ErrorBody {
  return typeof body === 'object' && body !== null && typeof (body as ErrorBody).detail === 'string'
}

/** Await an openapi-fetch call: its data on success, an ApiError otherwise. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response }
  try {
    result = await call
  } catch {
    throw new ApiError('Could not reach the server', 0)
  }
  const { data, error, response } = result
  if (!response.ok) {
    if (isErrorBody(error)) throw new ApiError(error.detail, response.status, error.code, error.fields)
    // No shared error body: the Vite proxy answers 5xx when the backend isn't running.
    throw new ApiError(`Request failed (${response.status})`, response.status)
  }
  return data as T
}
