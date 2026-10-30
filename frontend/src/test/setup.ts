import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { queryClient } from '@/shared/api/query'

// jsdom lacks these browser APIs; tests that care replace them with mocks.
// Blob.text() reads jsdom's internal buffer directly: FileReader uses timers, which hang
// under vi.useFakeTimers().
if (!Blob.prototype.text) {
  const impl = Object.getOwnPropertySymbols(new Blob()).find((s) => String(s) === 'Symbol(impl)')
  Blob.prototype.text = function text(this: Blob) {
    const buffer = impl && (this as unknown as Record<symbol, { _buffer?: Uint8Array }>)[impl]?._buffer
    if (!buffer) return Promise.reject(new Error('Blob.text polyfill: unsupported jsdom version'))
    return Promise.resolve(new TextDecoder().decode(buffer))
  }
}
URL.createObjectURL ??= () => 'blob:jsdom'
URL.revokeObjectURL ??= () => {}
// jsdom logs "not implemented" for scrolling; the app scrolls on every page change.
window.scrollTo = () => {}

afterEach(() => {
  cleanup()
  // Tests reuse ids like q1: each starts with an empty cache.
  queryClient.clear()
})
