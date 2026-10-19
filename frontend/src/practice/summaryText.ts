import { transcriptText } from '../filenames'
import { formatClock } from '../timeLabel'
import type { Transcript } from './practiceApi'

type Word = Transcript['words'][number]

export interface SummaryRow {
  label: string
  value: string
}

function seconds(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} s`
}

/**
 * The "How it went" rows (docs/design/flows.md F4.1). Values the server returns as null show
 * "—". Length falls back to the take's own duration when Deepgram doesn't report one.
 */
export function summaryRows(transcript: Transcript, recordedMs: number): SummaryRow[] {
  const { summary } = transcript
  const length = transcript.duration_seconds ?? recordedMs / 1000
  const rows: SummaryRow[] = [
    { label: 'Length', value: formatClock(length * 1000) },
    { label: 'Pace', value: summary.words_per_minute === null ? '—' : `${summary.words_per_minute} wpm` },
  ]
  if (summary.fillers.length === 0) rows.push({ label: 'Fillers', value: 'none' })
  for (const filler of summary.fillers) rows.push({ label: `"${filler.word}"`, value: String(filler.count) })
  rows.push({
    label: 'Fillers per minute',
    value: summary.fillers_per_minute === null ? '—' : summary.fillers_per_minute.toFixed(1),
  })
  rows.push({
    label: 'Long pauses (1 s+)',
    value:
      summary.pause_count === 0 || summary.longest_pause_seconds === null
        ? 'none'
        : `${summary.pause_count} · longest ${seconds(summary.longest_pause_seconds)}`,
  })
  return rows
}

/** One line for the .txt download, e.g. `Length 1:12 · Pace 138 wpm · "um" 4 · …`. */
export function summaryLine(transcript: Transcript, recordedMs: number): string {
  return summaryRows(transcript, recordedMs)
    .map((row) => `${row.label} ${row.value}`)
    .join(' · ')
}

/** The .txt download: question, blank line, transcript, blank line, summary line (F4.3). */
export function transcriptFile(question: string, transcript: Transcript, recordedMs: number): string {
  return transcriptText(question, `${transcript.text}\n\n${summaryLine(transcript, recordedMs)}`)
}

export type Segment = { kind: 'word'; text: string; filler: boolean } | { kind: 'pause'; dots: number }

/**
 * The transcript as words and pauses for highlighting. Dots follow the contract's rule on the
 * raw gap between words (floor(gap + 0.001)), the same rule the server uses for `text`.
 */
export function transcriptSegments(words: Word[]): Segment[] {
  const segments: Segment[] = []
  words.forEach((word, index) => {
    if (index > 0) {
      const dots = Math.max(0, Math.floor(word.start - words[index - 1].end + 0.001))
      if (dots > 0) segments.push({ kind: 'pause', dots })
    }
    segments.push({ kind: 'word', text: word.punctuated_word, filler: word.is_filler })
  })
  return segments
}
