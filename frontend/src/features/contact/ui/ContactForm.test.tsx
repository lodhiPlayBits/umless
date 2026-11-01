import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BUSINESS } from '@/content/business'
import { ApiError } from '@/shared/api/client'
import { SessionContext } from '@/shared/lib/session'
import type { Session } from '@/shared/lib/session'
import ContactForm from './ContactForm'

function renderAs(status: Session['status'], send = vi.fn().mockResolvedValue(undefined)) {
  render(
    <SessionContext.Provider value={{ auth: 'clerk', status }}>
      <ContactForm send={send} />
    </SessionContext.Provider>,
  )
  return send
}

async function fillIn(message = 'The summary could show my pace by week.') {
  await userEvent.selectOptions(screen.getByLabelText('What is it about?'), 'complaint')
  await userEvent.type(screen.getByLabelText('Your name'), '  Asha  ')
  await userEvent.type(screen.getByLabelText('Your email'), 'asha@example.com')
  await userEvent.type(screen.getByLabelText('Message'), message)
}

describe('ContactForm', () => {
  it('asks signed-out visitors to sign in, and offers the email address', () => {
    renderAs('signedOut')
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in?redirect=%2Fcontact')
    expect(screen.getByRole('link', { name: BUSINESS.email })).toHaveAttribute('href', `mailto:${BUSINESS.email}`)
    expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
  })

  it('sends the message, trimmed, and says it arrived', async () => {
    const send = renderAs('signedIn')
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(send).toHaveBeenCalledWith({
      kind: 'complaint',
      name: 'Asha',
      email: 'asha@example.com',
      message: 'The summary could show my pace by week.',
    })
    expect(await screen.findByText('Message sent.')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('')
  })

  it('checks the fields before sending', async () => {
    const send = renderAs('signedIn')
    await userEvent.type(screen.getByLabelText('Your email'), 'not-an-email')
    await userEvent.type(screen.getByLabelText('Message'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(screen.getByText('Enter your name.')).toBeInTheDocument()
    expect(screen.getByText('Enter an email address we can reply to.')).toBeInTheDocument()
    expect(screen.getByText('Write at least 10 characters.')).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
  })

  it("shows the server's reason when it can't send", async () => {
    renderAs('signedIn', vi.fn().mockRejectedValue(new ApiError("You've sent a lot of messages this hour. Try again later, or email us.", 429, 'rate_limited')))
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText("The message wasn't sent")).toBeInTheDocument()
    expect(screen.getByText(/a lot of messages this hour/)).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('The summary could show my pace by week.')
  })

  it("puts the server's field errors next to the fields", async () => {
    renderAs(
      'signedIn',
      vi.fn().mockRejectedValue(new ApiError('Invalid', 422, 'validation_error', [{ field: 'body.email', message: 'String should match pattern' }])),
    )
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('String should match pattern')).toBeInTheDocument()
  })

  it('falls back to the email address when the server is unreachable', async () => {
    renderAs('signedIn', vi.fn().mockRejectedValue(new ApiError('Could not reach the server', 0)))
    await fillIn()
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText(new RegExp(`email us at ${BUSINESS.email}`))).toBeInTheDocument()
  })
})
