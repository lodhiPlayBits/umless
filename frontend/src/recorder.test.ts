import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUDIO_CONSTRAINTS,
  MAX_RECORDING_MS,
  MIME_TYPE_PREFERENCE,
  RecorderError,
  extensionFor,
  pickMimeType,
  startRecording,
} from './recorder'
import type { Recording } from './recorder'

class FakeMediaRecorder {
  static supported: string[] = ['audio/webm;codecs=opus', 'audio/webm']
  static instances: FakeMediaRecorder[] = []
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported.includes(type)
  }

  mimeType: string
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start = vi.fn((timeslice?: number) => {
    void timeslice
    this.state = 'recording'
  })
  /** Chunk the "browser" delivers after stop() but before onstop. */
  finalChunk: Blob | null = null
  args: unknown[]

  constructor(stream: unknown, options?: { mimeType?: string }) {
    this.args = options === undefined ? [stream] : [stream, options]
    this.mimeType = options?.mimeType ?? ''
    FakeMediaRecorder.instances.push(this)
  }

  stop = vi.fn(() => {
    this.state = 'inactive'
    queueMicrotask(() => {
      if (this.finalChunk) this.ondataavailable?.({ data: this.finalChunk })
      this.onstop?.()
    })
  })

  emit(data: Blob) {
    this.ondataavailable?.({ data })
  }
}

function makeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
  return { tracks, stream: { getTracks: () => tracks } as unknown as MediaStream }
}

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

function setGetUserMedia(impl: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: impl === undefined ? undefined : { getUserMedia: impl },
  })
}

function recorder() {
  return FakeMediaRecorder.instances[0]
}

beforeEach(() => {
  FakeMediaRecorder.supported = ['audio/webm;codecs=opus', 'audio/webm']
  FakeMediaRecorder.instances = []
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else delete (navigator as unknown as Record<string, unknown>).mediaDevices
})

describe('constants', () => {
  it('caps recordings at ten minutes', () => {
    expect(MAX_RECORDING_MS).toBe(600000)
  })

  it('turns browser audio processing off', () => {
    expect(AUDIO_CONSTRAINTS).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    })
  })

  it('prefers webm/opus, then webm, ogg, mp4', () => {
    expect(MIME_TYPE_PREFERENCE).toEqual([
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ])
  })
})

describe('pickMimeType', () => {
  it('returns the first supported type in preference order', () => {
    expect(pickMimeType((t) => t === 'audio/webm' || t === 'audio/mp4')).toBe('audio/webm')
  })

  it('returns the most preferred type when all are supported', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus')
  })

  it('returns an empty string when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBe('')
  })

  it('defaults to MediaRecorder.isTypeSupported', () => {
    FakeMediaRecorder.supported = ['audio/mp4']
    expect(pickMimeType()).toBe('audio/mp4')
  })
})

describe('extensionFor', () => {
  it.each([
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/ogg;codecs=opus', 'ogg'],
    ['audio/mp4', 'm4a'],
    ['audio/wav', 'webm'],
    ['', 'webm'],
  ])('maps %j to %s', (mime, ext) => {
    expect(extensionFor(mime)).toBe(ext)
  })
})

describe('startRecording', () => {
  it('rejects when getUserMedia is unavailable', async () => {
    setGetUserMedia(undefined)
    const error = await startRecording().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RecorderError)
    expect((error as Error).message).toBe('Recording is not supported in this browser')
  })

  it('rejects when MediaRecorder is unavailable', async () => {
    setGetUserMedia(vi.fn())
    vi.stubGlobal('MediaRecorder', undefined)
    const error = await startRecording().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RecorderError)
    expect((error as Error).message).toBe('Recording is not supported in this browser')
  })

  it('requests the microphone with raw audio constraints', async () => {
    const { stream } = makeStream()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    setGetUserMedia(getUserMedia)
    await startRecording()
    expect(getUserMedia).toHaveBeenCalledWith({ audio: AUDIO_CONSTRAINTS })
  })

  it('reports a denied permission', async () => {
    setGetUserMedia(vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')))
    const error = await startRecording().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RecorderError)
    expect((error as Error).message).toBe('Microphone access was denied')
  })

  it('reports other microphone failures', async () => {
    setGetUserMedia(vi.fn().mockRejectedValue(new DOMException('none', 'NotFoundError')))
    const error = await startRecording().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RecorderError)
    expect((error as Error).message).toMatch(/^Could not start the microphone/)
  })

  it('creates the recorder with the picked mime type and starts with a 1s timeslice', async () => {
    const { stream } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const handle = await startRecording()
    expect(recorder().args).toEqual([stream, { mimeType: 'audio/webm;codecs=opus' }])
    expect(recorder().start).toHaveBeenCalledWith(1000)
    expect(handle.mimeType).toBe('audio/webm;codecs=opus')
  })

  it('creates the recorder without options when no mime type is supported', async () => {
    FakeMediaRecorder.supported = []
    const { stream } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    await startRecording()
    expect(recorder().args).toEqual([stream])
  })

  it('stop() waits for onstop and returns every chunk, including a late one', async () => {
    const { stream } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const handle = await startRecording()
    recorder().emit(new Blob(['aa']))
    recorder().emit(new Blob([]))
    recorder().emit(new Blob(['bb']))
    recorder().finalChunk = new Blob(['cc'])

    const recording = await handle.stop()

    expect(recorder().stop).toHaveBeenCalledTimes(1)
    expect(recording.blob.size).toBe(6)
    expect(await recording.blob.text()).toBe('aabbcc')
    expect(recording.blob.type).toBe('audio/webm;codecs=opus')
    expect(recording.mimeType).toBe('audio/webm;codecs=opus')
  })

  it('reports the elapsed time as durationMs', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0))
    const { stream } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const handle = await startRecording()
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 3, 250))
    const recording = await handle.stop()
    expect(recording.durationMs).toBe(3250)
  })

  it('stops every microphone track after stopping', async () => {
    const { stream, tracks } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const handle = await startRecording()
    await handle.stop()
    for (const track of tracks) expect(track.stop).toHaveBeenCalled()
  })

  it('auto-stops after maxMs and reports the recording', async () => {
    vi.useFakeTimers()
    const { stream, tracks } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const onAutoStop = vi.fn<(r: Recording) => void>()
    await startRecording({ maxMs: 5000, onAutoStop })
    recorder().emit(new Blob(['xy']))

    await vi.advanceTimersByTimeAsync(4999)
    expect(recorder().stop).not.toHaveBeenCalled()
    expect(onAutoStop).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(recorder().stop).toHaveBeenCalledTimes(1)
    expect(onAutoStop).toHaveBeenCalledTimes(1)
    const recording = onAutoStop.mock.calls[0][0]
    expect(await recording.blob.text()).toBe('xy')
    expect(recording.durationMs).toBe(5000)
    for (const track of tracks) expect(track.stop).toHaveBeenCalled()
  })

  it('does not auto-stop after a manual stop', async () => {
    vi.useFakeTimers()
    const { stream } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const onAutoStop = vi.fn()
    const handle = await startRecording({ maxMs: 5000, onAutoStop })
    await handle.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(onAutoStop).not.toHaveBeenCalled()
  })

  it('defaults the auto-stop limit to MAX_RECORDING_MS', async () => {
    vi.useFakeTimers()
    const { stream } = makeStream()
    setGetUserMedia(vi.fn().mockResolvedValue(stream))
    const onAutoStop = vi.fn()
    await startRecording({ onAutoStop })
    await vi.advanceTimersByTimeAsync(MAX_RECORDING_MS - 1)
    expect(onAutoStop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onAutoStop).toHaveBeenCalledTimes(1)
  })
})
