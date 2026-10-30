import { describe, expect, it } from 'vitest'
import { baseFileName, slugify, transcriptText } from '@/shared/lib/filenames'

describe('slugify', () => {
  it('lower-cases and hyphenates words, dropping punctuation', () => {
    expect(slugify('Tell me about yourself!')).toBe('tell-me-about-yourself')
  })

  it('collapses runs of non-alphanumerics into one hyphen', () => {
    expect(slugify('a  --  b__c')).toBe('a-b-c')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  ??Hello?? ')).toBe('hello')
  })

  it('keeps an empty string empty', () => {
    expect(slugify('')).toBe('')
  })

  it('returns empty when there are no alphanumerics', () => {
    expect(slugify('?!?')).toBe('')
  })

  it('keeps digits', () => {
    expect(slugify('Top 10 tips')).toBe('top-10-tips')
  })

  it('limits the result to 40 characters', () => {
    expect(slugify('a'.repeat(60))).toBe('a'.repeat(40))
  })

  it('leaves exactly 40 characters untouched', () => {
    expect(slugify('b'.repeat(40))).toBe('b'.repeat(40))
  })

  it('leaves no trailing hyphen after cutting', () => {
    const input = 'a'.repeat(39) + ' bbbbb'
    expect(slugify(input)).toBe('a'.repeat(39))
  })
})

describe('baseFileName', () => {
  it('combines slug and zero-padded local date and time', () => {
    expect(baseFileName('Why umless?', new Date(2026, 9, 18, 9, 5, 7))).toBe(
      'why-umless-20261018-090507',
    )
  })

  it('falls back to "practice" for an empty question', () => {
    expect(baseFileName('', new Date(2026, 0, 2, 13, 14, 15))).toBe('practice-20260102-131415')
  })

  it('falls back to "practice" when the question has no alphanumerics', () => {
    expect(baseFileName('???', new Date(2026, 0, 2, 3, 4, 5))).toBe('practice-20260102-030405')
  })
})

describe('transcriptText', () => {
  it('puts the trimmed question, a blank line, the transcript and a newline', () => {
    expect(transcriptText('  Why umless?  ', 'Because.')).toBe('Why umless?\n\nBecause.\n')
  })

  it('omits the question when it is empty', () => {
    expect(transcriptText('', 'Because.')).toBe('Because.\n')
  })

  it('omits the question when it is only whitespace', () => {
    expect(transcriptText('   ', 'Because.')).toBe('Because.\n')
  })
})
