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

export class RecorderError extends Error {
  name = 'RecorderError'
}

export interface Recording {
  blob: Blob
  mimeType: string
  durationMs: number
}

export interface RecorderHandle {
  mimeType: string
  stop(): Promise<Recording>
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
    if (name === 'NotAllowedError') {
      throw new RecorderError('Microphone access was denied')
    }
    throw new RecorderError(`Could not start the microphone${message ? `: ${message}` : ''}`)
  }
}

export async function startRecording(
  options: { maxMs?: number; onAutoStop?: (recording: Recording) => void } = {},
): Promise<RecorderHandle> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new RecorderError('Recording is not supported in this browser')
  }

  const stream = await openMicrophone()
  const releaseMicrophone = () => stream.getTracks().forEach((track) => track.stop())
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
    if (!stoppedByUser) options.onAutoStop?.(recording)
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

  const autoStopTimer = setTimeout(requestStop, options.maxMs ?? MAX_RECORDING_MS)

  try {
    recorder.start(1000)
  } catch (error) {
    clearTimeout(autoStopTimer)
    releaseMicrophone()
    throw new RecorderError(`Could not start recording: ${(error as Error)?.message ?? error}`)
  }
  return { mimeType, stop }
}
