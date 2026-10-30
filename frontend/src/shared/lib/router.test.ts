import { describe, expect, it } from 'vitest'
import { buildPath, matchPath } from '@/shared/lib/router'

describe('matchPath', () => {
  it('matches static paths, with or without one trailing slash', () => {
    expect(matchPath('/', '/')).toEqual({})
    expect(matchPath('/terms', '/terms')).toEqual({})
    expect(matchPath('/terms', '/terms/')).toEqual({})
    expect(matchPath('/terms', '/terms/x')).toBeNull()
    expect(matchPath('/terms', '/')).toBeNull()
  })

  it('returns decoded params', () => {
    expect(matchPath('/practice/:questionId', '/practice/a%20b%2Fc')).toEqual({ questionId: 'a b/c' })
    expect(matchPath('/a/:x/b/:y', '/a/1/b/2/')).toEqual({ x: '1', y: '2' })
  })

  it('rejects empty segments, extra segments and malformed encoding', () => {
    expect(matchPath('/practice/:questionId', '/practice')).toBeNull()
    expect(matchPath('/practice/:questionId', '/practice/')).toBeNull()
    expect(matchPath('/practice/:questionId', '/practice/a/b')).toBeNull()
    expect(matchPath('/practice/:questionId', '/practice/%E0%A4%A')).toBeNull()
  })
})

describe('buildPath', () => {
  it('encodes params and round-trips through matchPath', () => {
    const path = buildPath('/practice/:questionId', { questionId: 'a b/c?' })
    expect(path).toBe('/practice/a%20b%2Fc%3F')
    expect(matchPath('/practice/:questionId', path)).toEqual({ questionId: 'a b/c?' })
  })

  it('throws on a missing param', () => {
    expect(() => buildPath('/practice/:questionId')).toThrow(/questionId/)
  })
})
