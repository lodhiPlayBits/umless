import { describe, expect, it } from 'vitest'
import type { Transcript } from './practiceApi'
import { summaryLine, summaryRows, transcriptFile, transcriptSegments } from './summaryText'

type Word = Transcript['words'][number]

const w = (text: string, start: number, end: number, is_filler = false): Word => ({
  word: text.toLowerCase(),
  punctuated_word: text,
  start,
  end,
  confidence: 0.9,
  is_filler,
  pause_before_seconds: 0,
})

function make(overrides: Partial<Transcript> = {}, summary: Partial<Transcript['summary']> = {}): Transcript {
  return {
    text: 'Hello there world',
    words: [w('Hello', 0, 0.3)],
    duration_seconds: 72,
    summary: {
      word_count: 3,
      filler_count: 0,
      fillers: [],
      words_per_minute: 138,
      fillers_per_minute: 0,
      pause_count: 0,
      longest_pause_seconds: null,
      ...summary,
    },
    ...overrides,
  }
}

const value = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value

describe('summaryRows', () => {
  it('shows Length as m:ss from duration_seconds and Pace as "N wpm"', () => {
    const rows = summaryRows(make(), 5_000)
    expect(value(rows, 'Length')).toBe('1:12')
    expect(value(rows, 'Pace')).toBe('138 wpm')
  })

  it('falls back to the recorded length when duration_seconds is null', () => {
    expect(value(summaryRows(make({ duration_seconds: null }), 65_000), 'Length')).toBe('1:05')
  })

  it('falls back to the recorded length when duration_seconds is 0, like the server', () => {
    expect(value(summaryRows(make({ duration_seconds: 0 }), 65_000), 'Length')).toBe('1:05')
  })

  it('shows "—" for a null pace and a null fillers per minute', () => {
    const rows = summaryRows(make({}, { words_per_minute: null, fillers_per_minute: null }), 0)
    expect(value(rows, 'Pace')).toBe('—')
    expect(value(rows, 'Fillers per minute')).toBe('—')
  })

  it('has one row per filler and no "Fillers none" row', () => {
    const rows = summaryRows(
      make({}, { fillers: [{ word: 'um', count: 4 }, { word: 'uh', count: 2 }], filler_count: 6 }),
      0,
    )
    expect(value(rows, '"um"')).toBe('4')
    expect(value(rows, '"uh"')).toBe('2')
    expect(value(rows, 'Fillers')).toBeUndefined()
  })

  it('shows "Fillers none" when there are no fillers', () => {
    expect(value(summaryRows(make(), 0), 'Fillers')).toBe('none')
  })

  it('formats fillers per minute with one decimal', () => {
    expect(value(summaryRows(make({}, { fillers_per_minute: 5 }), 0), 'Fillers per minute')).toBe('5.0')
    expect(value(summaryRows(make({}, { fillers_per_minute: 3.14159 }), 0), 'Fillers per minute')).toBe('3.1')
  })

  it('shows long pauses as count and longest, dropping ".0" for whole seconds', () => {
    const label = 'Long pauses (1 s+)'
    expect(value(summaryRows(make({}, { pause_count: 3, longest_pause_seconds: 4.2 }), 0), label)).toBe('3 · longest 4.2 s')
    expect(value(summaryRows(make({}, { pause_count: 2, longest_pause_seconds: 4 }), 0), label)).toBe('2 · longest 4 s')
  })

  it('shows long pauses as "none" when there are none', () => {
    expect(value(summaryRows(make(), 0), 'Long pauses (1 s+)')).toBe('none')
  })
})

describe('summaryLine and transcriptFile', () => {
  const t = make({}, { fillers: [{ word: 'um', count: 4 }], pause_count: 3, longest_pause_seconds: 4.2 })

  it('joins the rows into one line', () => {
    const line = summaryLine(t, 0)
    expect(line).toContain('Length 1:12')
    expect(line).toContain('Pace 138 wpm')
    expect(line).toContain('"um" 4')
    expect(line).toContain('Long pauses (1 s+) 3 · longest 4.2 s')
  })

  it('writes question, blank line, transcript, blank line, summary line, trailing newline', () => {
    expect(transcriptFile('Tell me about yourself.', t, 0)).toBe(
      `Tell me about yourself.\n\nHello there world\n\n${summaryLine(t, 0)}\n`,
    )
  })
})

describe('transcriptSegments', () => {
  it('returns words only, with filler flags, when there are no gaps', () => {
    expect(transcriptSegments([w('So', 0, 0.3), w('um', 0.3, 0.5, true)])).toEqual([
      { kind: 'word', text: 'So', filler: false },
      { kind: 'word', text: 'um', filler: true },
    ])
  })

  it('returns nothing for no words', () => {
    expect(transcriptSegments([])).toEqual([])
  })

  it('adds no pause for a gap under 1 s (0.996 s)', () => {
    const segs = transcriptSegments([w('a', 0, 1), w('b', 1.996, 2.2)])
    expect(segs.some((s) => s.kind === 'pause')).toBe(false)
  })

  it('adds one dot per full second: 1 s gives 1, 2.5 s gives 2', () => {
    expect(transcriptSegments([w('a', 0, 1), w('b', 2, 3)])[1]).toEqual({ kind: 'pause', dots: 1 })
    expect(transcriptSegments([w('a', 0, 1), w('b', 3.5, 4)])[1]).toEqual({ kind: 'pause', dots: 2 })
  })
})
