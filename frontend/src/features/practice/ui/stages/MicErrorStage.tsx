import type { ReactNode } from 'react'
import { PATHS } from '@/shared/config/paths'
import { Button, ButtonLink } from '@/shared/ui'
import ErrorBanner from '@/shared/ui/ErrorBanner'
import type { MicErrorKind } from '../../model/practiceMachine'

type MicErrorStageProps = { kind: MicErrorKind; message: string; onRetry: () => void }

/** E1, E2 and a failed start: what went wrong with the microphone, how to fix it, and Try again. */
export default function MicErrorStage({ kind, message, onRetry }: MicErrorStageProps) {
  const actions = (
    <>
      <Button variant="primary" size="sm" onClick={onRetry}>
        Try again
      </Button>
      <ButtonLink to={PATHS.questions} variant="ghost" size="sm">
        Back to questions
      </ButtonLink>
    </>
  )
  const copy: Record<MicErrorKind, { title: string; body: ReactNode }> = {
    denied: {
      title: 'umless needs your microphone',
      body: (
        <ol className="mic-steps">
          <li>Click the lock or tune icon left of the address bar.</li>
          <li>
            Set <strong>Microphone</strong> to <strong>Allow</strong>.
          </li>
          <li>
            Come back and press <strong>Try again</strong>.
          </li>
        </ol>
      ),
    },
    'no-mic': {
      title: 'No microphone found',
      body: 'Plug in a headset or check that your microphone is enabled in your system sound settings, then try again.',
    },
    failed: {
      title: "The microphone couldn't start",
      body: `${message}. Close other apps that use the microphone, then try again.`,
    },
  }
  return (
    <ErrorBanner title={copy[kind].title} actions={actions}>
      {copy[kind].body}
    </ErrorBanner>
  )
}
