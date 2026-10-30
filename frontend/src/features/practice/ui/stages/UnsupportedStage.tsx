import { PATHS } from '@/shared/config/paths'
import { ButtonLink, EmptyState } from '@/shared/ui'

/** E3: this browser can't record (no MediaRecorder, or not a secure page). */
export default function UnsupportedStage() {
  return (
    <EmptyState
      icon="mic"
      title="This browser can't record audio"
      actions={
        <ButtonLink to={PATHS.questions} variant="secondary">
          Back to questions
        </ButtonLink>
      }
    >
      Open umless in a current version of Chrome or Edge.
    </EmptyState>
  )
}
