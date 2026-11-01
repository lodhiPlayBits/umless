import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendClientError = vi.fn()
vi.mock('@/shared/api/clientErrorsApi', () => ({ sendClientError }))

// reportError keeps per-page-load state (repeats, the cap), so each test gets a fresh module.
async function load() {
  vi.resetModules()
  return import('@/shared/lib/reportError')
}

beforeEach(() => {
  sendClientError.mockReset().mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  window.history.replaceState(null, '', '/practice/abc?token=secret#x')
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('reportError', () => {
  it('logs to the console and sends a report with the pathname only', async () => {
    const { reportError } = await load()
    const error = new TypeError('x is undefined')
    reportError(error, { componentStack: '\n    at Transcript' })

    expect(console.error).toHaveBeenCalledWith('umless error:', error, '\n    at Transcript')
    expect(sendClientError).toHaveBeenCalledWith({
      kind: 'render',
      message: 'TypeError: x is undefined',
      path: '/practice/abc',
      stack: error.stack,
      component_stack: '\n    at Transcript',
    })
  })

  it('reports values that are not Errors as text', async () => {
    const { reportError } = await load()
    reportError('plain string', undefined, 'rejection')
    reportError(undefined, undefined, 'rejection')

    expect(sendClientError).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'rejection', message: 'plain string', stack: '' }))
    expect(sendClientError).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'undefined' }))
  })

  it("cuts values to the contract's limits", async () => {
    const { reportError } = await load()
    const error = new Error('m'.repeat(2000))
    error.stack = 's'.repeat(20000)
    window.history.replaceState(null, '', '/' + 'p'.repeat(800))
    reportError(error, { componentStack: 'c'.repeat(20000) })

    const [report] = sendClientError.mock.calls[0]
    expect(report.message).toHaveLength(1000)
    expect(report.path).toHaveLength(500)
    expect(report.stack).toHaveLength(10000)
    expect(report.component_stack).toHaveLength(10000)
  })

  it('sends a repeated error once, and at most five per page load', async () => {
    const { reportError } = await load()
    const error = new Error('same')
    reportError(error)
    reportError(error)
    expect(sendClientError).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 10; i++) reportError(new Error(`different ${i}`))
    expect(sendClientError).toHaveBeenCalledTimes(5)
    // The console still gets every one.
    expect(console.error).toHaveBeenCalledTimes(12)
  })

  it('never throws when sending fails', async () => {
    const { reportError } = await load()
    sendClientError.mockRejectedValue(new Error('offline'))
    expect(() => reportError(new Error('boom'))).not.toThrow()
    // Let the rejected send settle: an unhandled rejection would fail the run.
    await Promise.resolve()
  })
})

describe('listenForUncaughtErrors', () => {
  it('reports uncaught errors and unhandled rejections, until stopped', async () => {
    const { listenForUncaughtErrors } = await load()
    const stop = listenForUncaughtErrors(window)

    const error = new Error('in a click handler')
    window.dispatchEvent(new ErrorEvent('error', { error, message: error.message }))
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejection, 'reason', { value: new Error('no catch') })
    window.dispatchEvent(rejection)

    expect(sendClientError).toHaveBeenNthCalledWith(1, expect.objectContaining({ kind: 'uncaught', message: 'Error: in a click handler' }))
    expect(sendClientError).toHaveBeenNthCalledWith(2, expect.objectContaining({ kind: 'rejection', message: 'Error: no catch' }))

    stop()
    // Message only: Vitest treats an unhandled error event carrying an Error as a test failure.
    window.dispatchEvent(new ErrorEvent('error', { message: 'after stop' }))
    expect(sendClientError).toHaveBeenCalledTimes(2)
  })

  it('reports Content-Security-Policy violations without the query string', async () => {
    const { listenForUncaughtErrors } = await load()
    const stop = listenForUncaughtErrors(window)
    // jsdom has no SecurityPolicyViolationEvent; an Event with its fields stands in.
    const violation = Object.assign(new Event('securitypolicyviolation'), {
      blockedURI: 'https://evil.example/x.js?session=secret#frag',
      effectiveDirective: 'script-src-elem',
      violatedDirective: 'script-src',
    })
    window.dispatchEvent(violation)
    stop()

    expect(sendClientError).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'csp', message: 'CSP script-src-elem blocked https://evil.example/x.js', stack: '' }),
    )
  })

  it('names inline violations, which have no URL', async () => {
    const { describeViolation } = await load()
    const inline = { blockedURI: 'inline', effectiveDirective: '', violatedDirective: 'style-src' } as SecurityPolicyViolationEvent
    expect(describeViolation(inline)).toBe('style-src blocked inline')
  })

  it('ignores opaque cross-origin "Script error." events', async () => {
    const { listenForUncaughtErrors } = await load()
    const stop = listenForUncaughtErrors(window)
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    stop()
    expect(sendClientError).not.toHaveBeenCalled()
  })
})
