import { useState } from 'react'
import type { FormEvent } from 'react'
import { BUSINESS } from '@/content/business'
import { signInPath } from '@/shared/config/paths'
import { useSession } from '@/shared/lib/session'
import { Banner, Button, ButtonLink, Field, Input, Panel, Select, Textarea } from '@/shared/ui'
import { sendContactMessage as realSend } from '../api/contactApi'
import type { ContactKind, ContactMessage } from '../api/contactApi'
import { MESSAGE_MAX, NAME_MAX, sendFailure, serverFieldErrors, validateContact } from '../model/contactForm'
import type { ContactErrors } from '../model/contactForm'
import './ContactForm.css'

const EMPTY: ContactMessage = { kind: 'suggestion', name: '', email: '', message: '' }
const KINDS: { value: ContactKind; label: string }[] = [
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'other', label: 'Something else' },
]

/** The Contact page's form for complaints and suggestions; signed-out visitors are asked to sign in. */
export default function ContactForm({ send = realSend }: { send?: typeof realSend }) {
  const { status } = useSession()
  const [form, setForm] = useState<ContactMessage>(EMPTY)
  const [errors, setErrors] = useState<ContactErrors>({})
  const [sending, setSending] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null)

  if (status !== 'signedIn') {
    return (
      <Panel title="Send us a complaint or suggestion" className="contact-form">
        <p>
          Sign in to send a message from here, or email us at <a href={`mailto:${BUSINESS.email}`}>{BUSINESS.email}</a>.
        </p>
        <ButtonLink to={signInPath('/contact')} variant="primary">
          Sign in
        </ButtonLink>
      </Panel>
    )
  }

  const set = (field: keyof ContactMessage) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setOutcome(null)
    const found = validateContact(form)
    setErrors(found)
    if (Object.keys(found).length) return
    setSending(true)
    try {
      await send({ ...form, name: form.name.trim(), message: form.message.trim() })
      setForm(EMPTY)
      setOutcome({ ok: true, text: "Thanks: your message reached us. We'll reply to your email within 2 working days." })
    } catch (error) {
      const fields = serverFieldErrors(error)
      if (Object.keys(fields).length) setErrors(fields)
      else setOutcome({ ok: false, text: sendFailure(error, BUSINESS.email) })
    }
    setSending(false)
  }

  return (
    <Panel title="Send us a complaint or suggestion" className="contact-form">
      {outcome && (
        <Banner tone={outcome.ok ? 'success' : 'warning'} title={outcome.ok ? 'Message sent.' : "The message wasn't sent"}>
          {outcome.text}
        </Banner>
      )}
      <form onSubmit={(event) => void submit(event)} noValidate>
        <Field label="What is it about?">
          <Select value={form.kind} onChange={(e) => set('kind')(e.target.value)}>
            {KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Your name" error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={NAME_MAX} autoComplete="name" />
        </Field>
        <Field label="Your email" hint="We reply to this address." error={errors.email}>
          <Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Message" hint={`${form.message.length} / ${MESSAGE_MAX}`} error={errors.message}>
          <Textarea value={form.message} onChange={(e) => set('message')(e.target.value)} rows={6} maxLength={MESSAGE_MAX} />
        </Field>
        <Button type="submit" variant="primary" disabled={sending}>
          {sending ? 'Sending…' : 'Send message'}
        </Button>
      </form>
    </Panel>
  )
}
