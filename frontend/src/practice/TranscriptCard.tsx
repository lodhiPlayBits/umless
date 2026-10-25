import { Fragment, useId } from 'react'
import type { Transcript } from './practiceApi'
import { transcriptSegments } from './summaryText'

/** The transcript with fillers highlighted and pauses as dots (docs/design/flows.md F4.2). */
export default function TranscriptCard({ transcript }: { transcript: Transcript }) {
  const headingId = useId()
  return (
    <article className="card transcript" aria-labelledby={headingId}>
      <h2 id={headingId}>Transcript</h2>
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
  )
}
