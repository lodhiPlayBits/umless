import { afterEach, describe, expect, it, vi } from 'vitest'
import { startRecording } from './recorder'

// Chrome creates an AudioContext "suspended" when it isn't created inside the click itself, and
// ours is created after `await getUserMedia()`. A suspended context hands the analyser silence,
// so the level meter stayed flat while recording worked (bug report 2026-10-30).

class FakeMediaRecorder {
  static isTypeSupported = () => true
  mimeType = 'audio/webm'
  state = 'inactive'
  ondataavailable = null
  onstop: (() => void) | null = null
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    queueMicrotask(() => this.onstop?.())
  }
}

function fakeAudioContext(initialState: 'running' | 'suspended') {
  const contexts: { state: string; resume: ReturnType<typeof vi.fn> }[] = []
  class FakeAudioContext {
    state = initialState
    resume = vi.fn(async () => {
      this.state = 'running'
    })
    constructor() {
      contexts.push(this)
    }
    createAnalyser() {
      return {
        fftSize: 0,
        // A speaking microphone, but only while the context is running.
        getByteTimeDomainData: (samples: Uint8Array) => {
          samples.forEach((_, i) => (samples[i] = this.state === 'running' ? (i % 2 ? 192 : 64) : 128))
        },
      }
    }
    createMediaStreamSource() {
      return { connect: () => {} }
    }
    close = vi.fn(async () => {})
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  return contexts
}

function stubMicrophone() {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  const stream = { getTracks: () => [{ stop: () => {}, addEventListener: () => {} }] }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => stream } })
}

afterEach(() => vi.unstubAllGlobals())

describe('level meter', () => {
  it('resumes an audio context the browser started suspended, so the meter hears the microphone', async () => {
    stubMicrophone()
    const contexts = fakeAudioContext('suspended')
    const handle = await startRecording()
    expect(contexts[0].resume).toHaveBeenCalledOnce()
    await Promise.resolve()
    expect(handle.level?.()).toBeGreaterThan(0.5)
    await handle.stop()
  })

  it('leaves a running context alone', async () => {
    stubMicrophone()
    const contexts = fakeAudioContext('running')
    const handle = await startRecording()
    expect(contexts[0].resume).not.toHaveBeenCalled()
    expect(handle.level?.()).toBeGreaterThan(0.5)
    await handle.stop()
  })
})
