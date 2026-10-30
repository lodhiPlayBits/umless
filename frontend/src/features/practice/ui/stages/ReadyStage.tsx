import { Banner, Icon, Kbd } from '@/shared/ui'
import { PastTakes } from '@/features/takes'
import type { TakesApi } from '@/features/takes'

type ReadyStageProps = {
  questionId: string
  question: string
  serverUp: boolean | null
  takes?: TakesApi
  onStart: () => void
}

/** F3.1: the big record button, what happens to the recording, and this question's past takes. */
export default function ReadyStage({ questionId, question, serverUp, takes, onStart }: ReadyStageProps) {
  return (
    <>
      <p className="practice-lead">
        Answer out loud as if it were the real thing. You'll see every "um", "uh" and long pause afterwards.
      </p>
      <section className="practice-stage" aria-label="Start recording">
        <button type="button" className="record-button" onClick={onStart} aria-label="Start recording">
          <span className="record-button__dot" aria-hidden="true" />
        </button>
        <strong className="record-label" aria-hidden="true">
          Start
        </strong>
        <p className="practice-stage__hint">
          Up to 10 minutes · Press <Kbd>Space</Kbd> to start
        </p>
      </section>
      <p className="practice-note">
        <Icon name="lock" />
        <span>
          Your recording stays in this browser tab until you transcribe it. It's then sent to Deepgram for transcription only
          and not used for training. The transcript is saved to your past takes, which only you can see; the recording itself
          is never stored, so download it if you want to keep it.
        </span>
      </p>
      {serverUp === false && (
        <Banner tone="warning" title="Server offline">
          You can record and download, but not transcribe until the server is back.
        </Banner>
      )}
      <PastTakes questionId={questionId} question={question} api={takes} />
    </>
  )
}
