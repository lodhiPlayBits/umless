import ChoiceDialog from '@/shared/ui/ChoiceDialog'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import type { PracticeSessionState } from '../model/usePracticeSession'

/** The session's "are you sure?" questions: E14 leave unsaved, E15 discard recording, record again. */
export default function PracticeDialogs({ session }: { session: PracticeSessionState }) {
  const { dialog, dialogs, stage } = session

  if (dialog.kind === 'leave-unsaved') {
    const transcriptSaved = stage.name === 'result' && !!stage.transcript.take_id
    return (
      <ChoiceDialog
        title="Leave without saving?"
        choices={[
          { label: 'Stay', onClick: dialogs.close },
          { label: 'Download audio', onClick: dialogs.downloadAudioNow },
          { label: 'Leave', style: 'danger', onClick: () => dialogs.leaveUnsaved(dialog.target) },
        ]}
      >
        {transcriptSaved ? (
          <p>
            Your transcript is saved in your past takes, but the recording isn't stored anywhere. Download it first if you want
            to keep it.
          </p>
        ) : (
          <p>Your recording and transcript aren't stored anywhere. Download them first if you want to keep them.</p>
        )}
      </ChoiceDialog>
    )
  }

  // Only while still recording: an auto-stop may have landed while it was open.
  if (dialog.kind === 'discard-recording' && stage.name === 'recording') {
    return (
      <ChoiceDialog
        title="Stop and discard this recording?"
        choices={[
          { label: 'Keep recording', onClick: dialogs.close },
          { label: 'Stop & review', onClick: dialogs.stopAndReview },
          { label: 'Discard', style: 'danger', onClick: () => dialogs.discardRecording(dialog.target) },
        ]}
      >
        <p>You're still recording.</p>
      </ChoiceDialog>
    )
  }

  if (dialog.kind === 'record-again') {
    return (
      <ConfirmDialog title="Record again?" confirmLabel="Record again" danger onCancel={dialogs.close} onConfirm={dialogs.confirmRecordAgain}>
        <p>This recording isn't saved anywhere. Download the audio first if you want to keep it.</p>
      </ConfirmDialog>
    )
  }

  return null
}
