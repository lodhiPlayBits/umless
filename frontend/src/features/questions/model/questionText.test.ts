import { describe, expect, it } from 'vitest'
import { checkQuestionText, matchesFilter, questionLength } from './questionText'
import type { Question } from './questionText'

const q = (id: string, text: string) => ({ id, text }) as Question
const list = [q('a', 'Tell me about yourself.'), q('b', 'Why this role?'), q('c', 'Biggest weakness?')]

describe('questionLength', () => {
  it('counts after trimming', () => {
    expect(questionLength('  hello  ')).toBe(5)
  })

  it('counts an emoji as one character', () => {
    expect(questionLength('😀😀')).toBe(2)
  })
})

describe('checkQuestionText', () => {
  it('reports empty for blank and whitespace-only text', () => {
    expect(checkQuestionText('', list)).toEqual({ kind: 'empty' })
    expect(checkQuestionText('   \t ', list)).toEqual({ kind: 'empty' })
  })

  it('accepts exactly 500 characters', () => {
    expect(checkQuestionText('a'.repeat(500), list)).toEqual({ kind: 'ok' })
  })

  it('reports too-long at 501 characters with the length', () => {
    expect(checkQuestionText('a'.repeat(501), list)).toEqual({ kind: 'too-long', length: 501 })
  })

  it('ignores surrounding whitespace when measuring length', () => {
    expect(checkQuestionText(`  ${'a'.repeat(500)}  `, list)).toEqual({ kind: 'ok' })
  })

  it('counts emoji as one character each', () => {
    expect(checkQuestionText('😀'.repeat(500), list)).toEqual({ kind: 'ok' })
    expect(checkQuestionText('😀'.repeat(501), list)).toEqual({ kind: 'too-long', length: 501 })
  })

  it('reports a duplicate ignoring case and whitespace, with the 1-based number', () => {
    expect(checkQuestionText('  WHY   this  role?  ', list)).toEqual({ kind: 'duplicate', number: 2 })
  })

  it('reports ok for new text', () => {
    expect(checkQuestionText('Something new', list)).toEqual({ kind: 'ok' })
  })

  it('reports ok for any text against an empty list', () => {
    expect(checkQuestionText('Hello', [])).toEqual({ kind: 'ok' })
  })

  it('does not treat the edited question as its own duplicate', () => {
    expect(checkQuestionText('why this role?', list, 'b')).toEqual({ kind: 'ok' })
  })

  it('still finds duplicates of other questions while editing', () => {
    expect(checkQuestionText('Why this role?', list, 'a')).toEqual({ kind: 'duplicate', number: 2 })
  })
})

describe('matchesFilter', () => {
  it('matches a case-insensitive substring', () => {
    expect(matchesFilter(q('a', 'Tell me about yourself.'), 'ABOUT')).toBe(true)
  })

  it('does not match absent text', () => {
    expect(matchesFilter(q('a', 'Tell me about yourself.'), 'weakness')).toBe(false)
  })

  it('matches everything for an empty filter', () => {
    expect(matchesFilter(q('a', 'anything'), '')).toBe(true)
  })
})
