import { Spinner } from '@/shared/ui'

/** F3.2: waiting for the browser's microphone prompt; it's explained if the answer takes a moment. */
export default function PermissionStage({ showHint }: { showHint: boolean }) {
  return (
    <section className="practice-stage" role="status" aria-label="Waiting for microphone permission">
      <Spinner />
      {showHint && (
        <>
          <p>
            <strong>Allow microphone access</strong>
          </p>
          <p className="practice-stage__hint">
            Your browser is asking for permission near the address bar. Choose <strong>Allow</strong>. We only listen while
            you record.
          </p>
        </>
      )}
    </section>
  )
}
