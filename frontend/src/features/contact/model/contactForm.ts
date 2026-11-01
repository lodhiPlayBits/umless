import { ApiError } from '@/shared/api/client'
import type { ContactMessage } from '../api/contactApi'

// The same limits as ContactMessage in docs/api/openapi.yaml, checked before sending.
export const NAME_MAX = 100
export const MESSAGE_MIN = 10
export const MESSAGE_MAX = 5000
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type ContactErrors = Partial<Record<'name' | 'email' | 'message', string>>

/** What's wrong with each field, or an empty object when the message can be sent. */
export function validateContact(form: ContactMessage): ContactErrors {
  const errors: ContactErrors = {}
  if (!form.name.trim()) errors.name = 'Enter your name.'
  else if (form.name.length > NAME_MAX) errors.name = `Keep it to ${NAME_MAX} characters.`
  if (!EMAIL.test(form.email) || form.email.length > 254) errors.email = 'Enter an email address we can reply to.'
  if (form.message.trim().length < MESSAGE_MIN) errors.message = `Write at least ${MESSAGE_MIN} characters.`
  else if (form.message.length > MESSAGE_MAX) errors.message = `Keep it to ${MESSAGE_MAX} characters (${form.message.length} now).`
  return errors
}

/** Field errors from a 422, matched to the form's fields. */
export function serverFieldErrors(error: unknown): ContactErrors {
  const errors: ContactErrors = {}
  if (!(error instanceof ApiError)) return errors
  for (const { field, message } of error.fields ?? []) {
    const name = field.split('.').pop()
    if (name === 'name' || name === 'email' || name === 'message') errors[name] = message
  }
  return errors
}

/** The banner text when sending failed for a reason other than the fields. */
export function sendFailure(error: unknown, email: string): string {
  if (error instanceof ApiError && (error.code === 'rate_limited' || error.code === 'contact_failed' || error.code === 'contact_unavailable'))
    return error.message
  return `Your message couldn't be sent. Check your connection and try again, or email us at ${email}.`
}
