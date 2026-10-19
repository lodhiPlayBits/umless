import { Fragment, useMemo } from 'react'
import Link from '../Link'
import { practicePath } from '../router'
import { formatClock } from '../timeLabel'
import { useObjectUrl } from '../useObjectUrl'
import type { Transcript } from './practiceApi'
import { summaryRows, transcriptFile, transcriptSegments } from './summaryText'

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
    <a className="btn" href={audioUrl} download={audioName} onClick={props.onAudioDownloaded}>
      ⬇ Download audio (.{audioName.split('.').pop()})
    </a>
  )

  if (transcript.words.length === 0) {
    return (
      <div className="empty">
        <p>
          <strong>We couldn't hear any words</strong>
        </p>
        <p className="muted small">Speak a bit closer to the microphone and try again.</p>
        <div className="actions centered">
          <button type="button" className="btn btn-primary" onClick={props.onPractiseAgain}>
            Practise again
          </button>
          {audioLink}
        </div>
      </div>
    )
  }

  return (
    <div className="result-view">
      <div className="result-grid">
        <aside className="card summary" aria-label="Summary">
          <h2>How it went</h2>
          <dl>
            {summaryRows(transcript, recordedMs).map((row) => (
              <Fragment key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </Fragment>
            ))}
          </dl>
          <div className="player">
            <audio controls src={audioUrl} aria-label="Your recording" />
            <span className="time">{formatClock(recordedMs)}</span>
          </div>
          <div className="downloads">
            {transcriptUrl && (
              <a className="btn" href={transcriptUrl} download={`${baseName}.txt`} onClick={props.onTranscriptDownloaded}>
                ⬇ Download transcript (.txt)
              </a>
            )}
            {audioLink}
            <button type="button" className="btn btn-ghost" onClick={() => props.onCopy(transcript.text)}>
              ⧉ Copy transcript
            </button>
          </div>
        </aside>
        <article className="card transcript" aria-labelledby="transcript-heading">
          <h2 id="transcript-heading">Transcript</h2>
          <div className="legend">
            <span>
              <mark className="filler">um</mark> filler word
            </span>
            <span>
              <span className="pause">..</span> pause, one dot per second
            </span>
          </div>
          {/* E13: long transcripts scroll inside the card; tabIndex lets keyboard users scroll it. */}
          <div className="body" role="region" tabIndex={0} aria-label="Transcript text">
            {transcriptSegments(transcript.words).map((segment, index) => (
              <Fragment key={index}>
                {index > 0 && ' '}
                {segment.kind === 'pause' ? (
                  <span className="pause" role="img" aria-label={`${segment.dots} second pause`}>
                    {'.'.repeat(segment.dots)}
                  </span>
                ) : segment.filler ? (
                  <mark className="filler">{segment.text}</mark>
                ) : (
                  segment.text
                )}
              </Fragment>
            ))}
          </div>
        </article>
      </div>
      <div className="bottom-bar">
        <button type="button" className="btn btn-primary" onClick={props.onPractiseAgain}>
          Practise again
        </button>
        {nextId && (
          <Link to={practicePath(nextId)} className="btn">
            Next question →
          </Link>
        )}
      </div>
    </div>
  )
}
