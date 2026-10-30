import { Button, EmptyState } from '@/shared/ui'

/** E5: the recording came back empty. */
export default function NothingRecordedStage({ onRecordAgain }: { onRecordAgain: () => void }) {
  return (
    <EmptyState
      icon="mic"
      title="Nothing was recorded"
      actions={
        <Button variant="primary" onClick={onRecordAgain}>
          Record again
        </Button>
      }
    >
      Check that the right microphone is selected and isn't muted, then try again.
    </EmptyState>
  )
}
