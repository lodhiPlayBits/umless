export interface TranscriptWord {
  word: string
  start: number
  end: number
  confidence: number
}

export interface TranscriptResult {
  text: string
  words: TranscriptWord[]
  duration_seconds: number | null
}

export class ApiError extends Error {
  name = 'ApiError'
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function transcribe(audio: Blob): Promise<TranscriptResult> {
  let response: Response
  try {
    response = await fetch('/api/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': audio.type },
      body: audio,
    })
  } catch {
    throw new ApiError('Could not reach the server', 0)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = typeof body?.detail === 'string' ? body.detail : `Request failed (${response.status})`
    throw new ApiError(detail, response.status)
  }
  const body = await response.json().catch(() => null)
  if (typeof body?.text !== 'string') {
    throw new ApiError('Unexpected response from the server', response.status)
  }
  return body as TranscriptResult
}
