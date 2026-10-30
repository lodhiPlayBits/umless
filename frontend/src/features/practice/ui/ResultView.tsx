import { useMemo } from 'react'
import { practicePath } from '@/shared/config/paths'
import { formatClock } from '@/shared/lib/timeLabel'
import { useObjectUrl } from '@/shared/lib/useObjectUrl'
import { Button, ButtonLink, EmptyState, Icon, buttonClass } from '@/shared/ui'
import type { Transcript } from '../api/practiceApi'
import { summaryRows, transcriptFile } from '../model/summaryText'
import TranscriptCard from './TranscriptCard'

interface ResultViewProps {
  question: string
  transcript: Transcript
  recordedMs: number
  audioUrl: string
  audioName: string
  /** File name without extension, shared with the audio download. */
  baseName: string
  nextId: string | null
  onAudioDownloaded: () => void
  onTranscriptDownloaded: () => void
  onCopy: (text: string) => void
  onPractiseAgain: () => void
}

/** F4: summary, highlighted transcript, playback, downloads (or E12 when there were no words). */
export default function ResultView(props: ResultViewProps) {
  const { question, transcript, recordedMs, audioUrl, audioName, baseName, nextId } = props
  const fileText = useMemo(() => transcriptFile(question, transcript, recordedMs), [question, transcript, recordedMs])
  const fileBlob = useMemo(() => new Blob([fileText], { type: 'text/plain;charset=utf-8' }), [fileText])
  const transcriptUrl = useObjectUrl(fileBlob)

  const audioLink = (
    <a className={buttonClass({ size: 'sm' })} href={audioUrl} download={audioName} onClick={props.onAudioDownloaded}>
      <Icon name="download" />
      Download audio (.{audioName.split('.').pop()})
    </a>
  )

  if (transcript.words.length === 0) {
    return (
      <EmptyState
        icon="mic"
        title="We couldn't hear any words"
        actions={
          <>
            <Button variant="primary" onClick={props.onPractiseAgain}>
              Practise again
            </Button>
            {audioLink}
          </>
        }
      >
        Speak a bit closer to the microphone and try again.
      </EmptyState>
    )
  }

  return (
    <div className="result-view">
      <div className="result-grid">
        <aside className="ui-panel result-summary" aria-label="Summary">
          <h2>How it went</h2>
          <dl className="result-stats">
            {summaryRows(transcript, recordedMs).map((row) => (
              <div key={row.label} className="ui-stat">
                <dt className="ui-stat__label">{row.label}</dt>
                <dd className="ui-stat__value">{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="player">
            <audio controls src={audioUrl} aria-label="Your recording" />
            <span className="player__time time">{formatClock(recordedMs)}</span>
          </div>
          <div className="result-downloads">
            {transcriptUrl && (
              <a className={buttonClass({ size: 'sm' })} href={transcriptUrl} download={`${baseName}.txt`} onClick={props.onTranscriptDownloaded}>
                <Icon name="download" />
                Download transcript (.txt)
              </a>
            )}
            {audioLink}
            <Button variant="ghost" size="sm" icon="copy" onClick={() => props.onCopy(transcript.text)}>
              Copy transcript
            </Button>
          </div>
        </aside>
        <TranscriptCard transcript={transcript} />
      </div>
      <div className="action-bar action-bar--split">
        <Button size="lg" onClick={props.onPractiseAgain}>
          Practise again
        </Button>
        {nextId && (
          <ButtonLink to={practicePath(nextId)} variant="primary" size="lg">
            Next question →
          </ButtonLink>
        )}
      </div>
    </div>
  )
}
