import { describe, expect, it } from 'vitest'
import { parseRoute, practicePath } from './router'

describe('parseRoute', () => {
  it('maps / to the questions page', () => {
    expect(parseRoute('/')).toEqual({ name: 'questions' })
  })

  it('maps /practice/<id> to the practice page', () => {
    expect(parseRoute('/practice/abc123')).toEqual({ name: 'practice', questionId: 'abc123' })
  })

  it('percent-decodes the id', () => {
    expect(parseRoute('/practice/a%20b%2Fc')).toEqual({ name: 'practice', questionId: 'a b/c' })
  })

  it('treats malformed percent-encoding as not found', () => {
    expect(parseRoute('/practice/%E0%A4%A')).toEqual({ name: 'notFound' })
  })

  it('treats unknown paths as not found', () => {
    expect(parseRoute('/nope')).toEqual({ name: 'notFound' })
    expect(parseRoute('/practice')).toEqual({ name: 'notFound' })
    expect(parseRoute('/practice/')).toEqual({ name: 'notFound' })
    expect(parseRoute('/practice/a/b')).toEqual({ name: 'notFound' })
  })
})

describe('practicePath', () => {
  it('builds /practice/<id>', () => {
    expect(practicePath('abc')).toBe('/practice/abc')
  })

  it('encodes the id and round-trips through parseRoute', () => {
    const path = practicePath('a b/c?')
    expect(path).toBe('/practice/a%20b%2Fc%3F')
    expect(parseRoute(path)).toEqual({ name: 'practice', questionId: 'a b/c?' })
  })
})
