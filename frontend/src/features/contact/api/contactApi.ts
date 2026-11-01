import { client, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/generated/openapi'

export type ContactMessage = components['schemas']['ContactMessage']
export type ContactKind = ContactMessage['kind']

/** docs/api/openapi.yaml sendContactMessage: emails umless, with the sender's address as Reply-To. */
export async function sendContactMessage(message: ContactMessage): Promise<void> {
  await unwrap(client.POST('/api/contact', { body: message }))
}
