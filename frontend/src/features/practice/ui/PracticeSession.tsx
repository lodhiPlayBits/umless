import { useState } from 'react'
import { BuyTime } from '@/features/billing'
import Toast from '@/shared/ui/Toast'
import type { PracticeQuestion } from '../api/practiceApi'
import type { TakesApi } from '@/features/takes'
import { usePracticeSession } from '../model/usePracticeSession'
import { limitedByTimeLeft } from '../model/recordingLimit'
import type { PracticeDeps } from '../model/usePracticeSession'
import PracticeDialogs from './PracticeDialogs'
import PracticeHeader from './PracticeHeader'
import RecordingStage from './RecordingStage'
import MicErrorStage from './stages/MicErrorStage'
import NothingRecordedStage from './stages/NothingRecordedStage'
import PermissionStage from './stages/PermissionStage'
import ReadyStage from './stages/ReadyStage'
import ResultStage from './stages/ResultStage'
import TakeReviewStage from './stages/TakeReviewStage'
import UnsupportedStage from './stages/UnsupportedStage'
import './practice.css'

interface PracticeSessionProps extends PracticeDeps {
  practice: PracticeQuestion
  serverUp: boolean | null
  /** Past takes; the real API by default. */
  takes?: TakesApi
}

/**
 * F3–F4: record, review, transcribe, result. The logic lives in usePracticeSession (the stage
 * machine and its effects); this picks the view for the current stage.
 */
export default function PracticeSession({ practice, serverUp, takes, ...deps }: PracticeSessionProps) {
  const session = usePracticeSession(practice, deps)
  const { stage, take, audioUrl, actions } = session
  const [buyingTime, setBuyingTime] = useState(false)

  return (
    <div className="practice">
      <PracticeHeader
        question={session.question}
        number={practice.number}
        total={practice.total}
        nextId={practice.nextId}
        showPosition={stage.name === 'ready' || stage.name === 'result'}
        showNext={stage.name === 'ready'}
      />

      {stage.name === 'ready' && (
        <ReadyStage
          questionId={practice.question.id}
          question={session.question}
          serverUp={serverUp}
          takes={takes}
          limitMs={session.limitMs}
          onStart={actions.start}
        />
      )}
      {stage.name === 'requesting' && <PermissionStage showHint={stage.showHint} />}
      {stage.name === 'mic-error' && <MicErrorStage kind={stage.kind} message={stage.message} onRetry={actions.start} />}
      {stage.name === 'unsupported' && <UnsupportedStage />}
      {stage.name === 'recording' && (
        <RecordingStage
          startedAt={stage.startedAt}
          level={session.readLevel}
          maxMs={session.limitMs}
          onStop={actions.stop}
          onCancel={actions.cancelTake}
        />
      )}
      {stage.name === 'empty' && <NothingRecordedStage onRecordAgain={actions.reset} />}
      {take && audioUrl && (stage.name === 'review' || stage.name === 'transcribing' || stage.name === 'transcribe-error') && (
        <TakeReviewStage
          stage={stage}
          take={take}
          audioUrl={audioUrl}
          audioName={session.audioName}
          limitedByTime={limitedByTimeLeft(session.limitMs)}
          onTranscribe={actions.transcribe}
          onRecordAgain={actions.recordAgain}
          onAudioDownloaded={actions.audioDownloaded}
          onBuyTime={() => setBuyingTime(true)}
        />
      )}
      {stage.name === 'result' && audioUrl && (
        <ResultStage
          question={session.question}
          transcript={stage.transcript}
          recordedMs={stage.take.recording.durationMs}
          audioUrl={audioUrl}
          audioName={session.audioName}
          baseName={session.baseName}
          nextId={practice.nextId}
          onAudioDownloaded={actions.audioDownloaded}
          onTranscriptDownloaded={actions.transcriptDownloaded}
          onCopy={actions.copyTranscript}
          onPractiseAgain={actions.practiseAgain}
        />
      )}

      <PracticeDialogs session={session} />
      <Toast toast={session.toast} onDismiss={actions.dismissToast} />
      {buyingTime && (
        <BuyTime
          onDone={(message) => {
            setBuyingTime(false)
            if (message) actions.showToast(`${message} Press Try again to transcribe.`)
          }}
        />
      )}
    </div>
  )
}
