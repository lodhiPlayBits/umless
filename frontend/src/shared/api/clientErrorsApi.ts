import { client, hasSessionToken, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/generated/openapi'

export type ClientErrorReport = components['schemas']['ClientErrorReport']

/**
 * Send a crash report to the server log, signed-in users only (the endpoint needs a session).
 * Resolves false when nothing was sent because there is no session; rejects if sending failed.
 */
export async function sendClientError(report: ClientErrorReport): Promise<boolean> {
  if (!(await hasSessionToken())) return false
  await unwrap(client.POST('/api/client-errors', { body: report }))
  return true
}
