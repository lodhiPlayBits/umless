export const MAX_RECORDING_MS = 10 * 60 * 1000

// "Raw voice": browser processing can soften short sounds like "um".
export const AUDIO_CONSTRAINTS = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
}

export const MIME_TYPE_PREFERENCE = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

/** unsupported: no MediaRecorder or not a secure context (E3); denied: E1; no-mic: E2. */
export type RecorderErrorKind = 'unsupported' | 'denied' | 'no-mic' | 'failed'

export class RecorderError extends Error {
  name = 'RecorderError'
  kind: RecorderErrorKind

  constructor(message: string, kind: RecorderErrorKind = 'failed') {
    super(message)
    this.kind = kind
  }
}

/** Why a recording ended without stop(): the time cap, or the browser ending the mic (E4). */
export type AutoStopReason = 'limit' | 'device-lost'

export interface Recording {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface RecorderHandle {
  mimeType: string
  stop(): Promise<Recording>
  /** Input level from 0 to 1 right now, or null when the browser can't measure it. */
  level?(): number | null
}

export function isRecordingSupported(): boolean {
  return (
    globalThis.isSecureContext !== false &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  )
}

export function pickMimeType(
  isSupported: (type: string) => boolean = (type) => MediaRecorder.isTypeSupported(type),
): string {
  return MIME_TYPE_PREFERENCE.find((type) => isSupported(type)) ?? ''
}

export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('audio/ogg')) return 'ogg'
  if (mimeType.startsWith('audio/mp4')) return 'm4a'
  return 'webm'
}

async function openMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
  } catch (error) {
    // DOMException is not an Error subclass in every environment, so read fields by shape.
    const { name, message } = (error ?? {}) as { name?: string; message?: string }
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw new RecorderError('Microphone access was denied', 'denied')
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw new RecorderError(`Could not start the microphone: ${message || 'no microphone was found'}`, 'no-mic')
    }
    throw new RecorderError(`Could not start the microphone${message ? `: ${message}` : ''}`)
  }
}

/** Reads the input level for the meter; a no-op where Web Audio isn't available (tests, old browsers). */
function createLevelMeter(stream: MediaStream): { level: () => number | null; close: () => void } {
  if (typeof AudioContext === 'undefined') return { level: () => null, close: () => {} }
  try {
    const context = new AudioContext()
    // Created after `await getUserMedia()`, outside the click, so Chrome may start it suspended,
    // and a suspended context gives the analyser silence. The click already allowed audio, so resume.
    if (context.state === 'suspended') void context.resume().catch(() => {})
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    context.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    return {
      level: () => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) sum += ((sample - 128) / 128) ** 2
        // RMS of normal speech is around 0.05-0.3; scale so it fills the meter.
        return Math.min(1, Math.sqrt(sum / samples.length) * 4)
      },
      close: () => void context.close().catch(() => {}),
    }
  } catch {
    return { level: () => null, close: () => {} }
  }
}

export async function startRecording(
  options: { maxMs?: number; onAutoStop?: (recording: Recording, reason?: AutoStopReason) => void } = {},
): Promise<RecorderHandle> {
  if (!isRecordingSupported()) {
    throw new RecorderError('Recording is not supported in this browser', 'unsupported')
  }

  const stream = await openMicrophone()
  const meter = createLevelMeter(stream)
  const releaseMicrophone = () => {
    meter.close()
    stream.getTracks().forEach((track) => track.stop())
  }
  const picked = pickMimeType()
  let recorder: MediaRecorder
  try {
    recorder = picked ? new MediaRecorder(stream, { mimeType: picked }) : new MediaRecorder(stream)
  } catch (error) {
    releaseMicrophone()
    throw new RecorderError(`Could not start recording: ${(error as Error)?.message ?? error}`)
  }
  const mimeType = recorder.mimeType || picked
  const chunks: Blob[] = []
  const startedAt = Date.now()
  let stoppedByUser = false
  let limitReached = false
  let resolveStopped!: (recording: Recording) => void
  const stopped = new Promise<Recording>((resolve) => (resolveStopped = resolve))
  let finished = false

  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(autoStopTimer)
    releaseMicrophone()
    const recording = { blob: new Blob(chunks, { type: mimeType }), mimeType, durationMs: Date.now() - startedAt }
    resolveStopped(recording)
    // Timer cap, or the browser stopping on its own (mic unplugged, permission revoked).
    if (!stoppedByUser) options.onAutoStop?.(recording, limitReached ? 'limit' : 'device-lost')
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  // The last chunk arrives after stop() and before onstop, so the blob is built in onstop.
  recorder.onstop = finish

  let stopRequested = false
  const requestStop = () => {
    // A repeat request must not finish early: the last chunk and onstop are still on their way.
    if (stopRequested || finished) return
    stopRequested = true
    // Already inactive means the browser stopped by itself; its onstop calls finish().
    if (recorder.state === 'inactive') return
    try {
      recorder.stop()
    } catch {
      finish()
    }
  }

  const stop = () => {
    stoppedByUser = true
    requestStop()
    return stopped
  }

  const autoStopTimer = setTimeout(() => {
    limitReached = true
    requestStop()
  }, options.maxMs ?? MAX_RECORDING_MS)

  try {
    recorder.start(1000)
  } catch (error) {
    clearTimeout(autoStopTimer)
    releaseMicrophone()
    throw new RecorderError(`Could not start recording: ${(error as Error)?.message ?? error}`)
  }
  return { mimeType, stop, level: meter.level }
}
