import { formatClock } from '@/shared/lib/timeLabel'
import { Banner, Button, Icon, Panel, Spinner, buttonClass } from '@/shared/ui'
import ErrorBanner from '@/shared/ui/ErrorBanner'
import type { Stage, Take } from '../../model/practiceMachine'

type ReviewStage = Extract<Stage, { name: 'review' | 'transcribing' | 'transcribe-error' }>

type TakeReviewStageProps = {
  stage: ReviewStage
  take: Take
  audioUrl: string
  audioName: string
  /** The recording was capped by the practice time left, not the 10-minute limit. */
  limitedByTime?: boolean
  onTranscribe: () => void
  onRecordAgain: () => void
  onAudioDownloaded: () => void
  onBuyTime: () => void
}

/**
 * F3.5–3.7 and E8–E11: the take with its player, then Transcribe; the spinner while it's sent;
 * or what went wrong, with the recording kept.
 */
export default function TakeReviewStage(props: TakeReviewStageProps) {
  const { stage, take, audioUrl, audioName } = props
  const length = formatClock(take.recording.durationMs)
  return (
    <>
      {stage.name === 'review' && stage.notice === 'limit' && !props.limitedByTime && <Banner tone="info" title="Stopped at the 10-minute limit" />}
      {stage.name === 'review' && stage.notice === 'limit' && props.limitedByTime && (
        <Banner tone="info" title="Stopped when your practice time ran out">
          This take uses all the time you had left, so it can be transcribed in full. Buy more time to keep practising.
        </Banner>
      )}
      {stage.name === 'review' && stage.notice === 'device-lost' && (
        <Banner tone="warning" role="alert" title="Recording stopped: the microphone was disconnected">
          We kept the {length} you recorded.
        </Banner>
      )}

      <Panel title="Your take">
        <div className="player">
          <audio controls src={audioUrl} aria-label="Your recording" />
          <span className="player__time time">{length}</span>
        </div>
        {stage.name === 'review' && (
          <p className="practice-note">
            <Icon name="info" />
            <span>Not saved anywhere yet. Transcribe it, or download the audio to keep it.</span>
          </p>
        )}
      </Panel>

      {stage.name === 'transcribing' && (
        <section className="practice-stage" role="status" aria-live="polite">
          <Spinner className="spinner" />
          <p>
            <strong>Transcribing…</strong>
          </p>
          <p className="practice-stage__hint">Usually a few seconds.</p>
        </section>
      )}

      {stage.name === 'transcribe-error' && (
        <ErrorBanner
          title={stage.failure.title}
          detail={stage.failure.detail}
          actions={
            stage.failure.needsTime && (
              <Button variant="primary" size="sm" onClick={props.onBuyTime}>
                Buy practice time
              </Button>
            )
          }
        />
      )}

      {stage.name !== 'transcribing' && (
        <div className="action-bar">
          {(stage.name === 'review' || stage.failure.canRetry) && (
            <Button variant="primary" size="lg" onClick={props.onTranscribe}>
              {stage.name === 'review' ? 'Transcribe' : 'Try again'}
            </Button>
          )}
          <Button size="lg" onClick={props.onRecordAgain}>
            Record again
          </Button>
          <a className={buttonClass({ variant: 'ghost', size: 'lg' })} href={audioUrl} download={audioName} onClick={props.onAudioDownloaded}>
            <Icon name="download" />
            Audio
          </a>
        </div>
      )}
    </>
  )
}
