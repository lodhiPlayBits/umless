// Regression tests for the Phase 2 code review: the mic must always be released and stop()
// must always settle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecorderError, startRecording } from './recorder'

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static throwOnConstruct = false
  static throwOnStart = false
  static throwOnStop = false
  static isTypeSupported = () => true

  mimeType = 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  /** Chunk the "browser" delivers after stop(), before onstop, like a real MediaRecorder. */
  finalChunk: Blob | null = null
  stop = vi.fn(() => {
    if (FakeRecorder.throwOnStop) throw new DOMException('bad state', 'InvalidStateError')
    if (this.state === 'inactive') return
    this.state = 'inactive'
    setTimeout(() => {
      if (this.finalChunk) this.ondataavailable?.({ data: this.finalChunk })
      this.onstop?.()
    }, 0)
  })

  constructor() {
    if (FakeRecorder.throwOnConstruct) throw new DOMException('nope', 'NotSupportedError')
    FakeRecorder.instances.push(this)
  }

  start() {
    if (FakeRecorder.throwOnStart) throw new DOMException('nope', 'InvalidStateError')
    this.state = 'recording'
  }

  /** The browser ending the recording itself, e.g. the microphone was unplugged. */
  endBySelf() {
    this.state = 'inactive'
    this.onstop?.()
  }
}

let tracks: { stop: ReturnType<typeof vi.fn> }[]
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

beforeEach(() => {
  Object.assign(FakeRecorder, { instances: [], throwOnConstruct: false, throwOnStart: false, throwOnStop: false })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  tracks = [{ stop: vi.fn() }]
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else delete (navigator as unknown as Record<string, unknown>).mediaDevices
})

describe('startRecording failures after the mic is open', () => {
  it('releases the mic when the recorder cannot be created', async () => {
    FakeRecorder.throwOnConstruct = true
    await expect(startRecording()).rejects.toBeInstanceOf(RecorderError)
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('releases the mic when the recorder cannot start', async () => {
    FakeRecorder.throwOnStart = true
    await expect(startRecording()).rejects.toThrow(/^Could not start recording/)
    expect(tracks[0].stop).toHaveBeenCalled()
  })
})

describe('recorder stopping on its own', () => {
  it('reports the recording through onAutoStop and releases the mic', async () => {
    const onAutoStop = vi.fn()
    await startRecording({ onAutoStop })
    FakeRecorder.instances[0].ondataavailable?.({ data: new Blob(['ab']) })

    FakeRecorder.instances[0].endBySelf()

    expect(onAutoStop).toHaveBeenCalledTimes(1)
    expect(await onAutoStop.mock.calls[0][0].blob.text()).toBe('ab')
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('lets a later stop() resolve instead of hanging', async () => {
    const handle = await startRecording()
    FakeRecorder.instances[0].endBySelf()

    const recording = await handle.stop()

    expect(recording.mimeType).toBe('audio/webm;codecs=opus')
    expect(FakeRecorder.instances[0].stop).not.toHaveBeenCalled()
  })

  it('still resolves stop() when recorder.stop() throws', async () => {
    const handle = await startRecording()
    FakeRecorder.throwOnStop = true

    await expect(handle.stop()).resolves.toMatchObject({ mimeType: 'audio/webm;codecs=opus' })
    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('keeps the final chunk when stop() is called twice', async () => {
    const handle = await startRecording()
    FakeRecorder.instances[0].ondataavailable?.({ data: new Blob(['ab']) })
    FakeRecorder.instances[0].finalChunk = new Blob(['cd'])

    const [first, second] = await Promise.all([handle.stop(), handle.stop()])

    expect(await first.blob.text()).toBe('abcd')
    expect(second).toBe(first)
  })

  it('keeps the final chunk when the user stops right after the auto-stop', async () => {
    vi.useFakeTimers()
    try {
      const handle = await startRecording({ maxMs: 1000 })
      FakeRecorder.instances[0].finalChunk = new Blob(['last'])
      vi.advanceTimersByTime(1000) // auto-stop requested; final chunk not delivered yet

      const pending = handle.stop()
      await vi.runAllTimersAsync()

      expect(await (await pending).blob.text()).toBe('last')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not call onAutoStop for a manual stop', async () => {
    const onAutoStop = vi.fn()
    const handle = await startRecording({ onAutoStop })
    await handle.stop()
    expect(onAutoStop).not.toHaveBeenCalled()
  })
})
