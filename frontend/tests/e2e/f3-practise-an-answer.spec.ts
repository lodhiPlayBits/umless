import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { TRANSCRIPTIONS, resetQuestions, seedQuestions } from './helpers'

// docs/design/flows.md, F3: Practising an answer (steps 1-8) and edge cases E1-E3, E8-E11, E15, E16.

const QUESTION = 'Tell me about yourself'
const FAKE_TRANSCRIPT = 'this is a fake transcript'

test.beforeEach(async ({ request }) => {
  await resetQuestions(request)
})

async function openPractice(page: Page, request: Parameters<typeof seedQuestions>[0], texts = [QUESTION]) {
  const questions = await seedQuestions(request, texts)
  await page.goto(`/practice/${questions[0].id}`)
  return questions
}

const startButton = (page: Page) => page.getByRole('button', { name: 'Start recording' })
const stopButton = (page: Page) => page.getByRole('button', { name: 'Stop recording' })
const transcribeButton = (page: Page) => page.getByRole('button', { name: 'Transcribe', exact: true })
const tryAgainButton = (page: Page) => page.getByRole('button', { name: 'Try again' })
const downloadAudio = (page: Page) => page.getByRole('link', { name: /Audio/ })
const dialog = (page: Page) => page.getByRole('alertdialog')

/** Starts recording and waits until the recording screen is up. */
async function startRecording(page: Page) {
  await startButton(page).click()
  await expect(stopButton(page)).toBeVisible()
}

/** Records for about a second with the fake microphone, then stops with the button. */
async function recordAndStop(page: Page) {
  await startRecording(page)
  await page.waitForTimeout(1200)
  await stopButton(page).click()
  await expect(transcribeButton(page)).toBeVisible()
}

function failTranscription(page: Page, status: number, body: { code: string; detail: string }) {
  return page.route(TRANSCRIPTIONS, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

test('F3.1 practice-ready shows the question, the tip, the privacy note and a big Start button', async ({ page, request }) => {
  await openPractice(page, request)

  await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
  await expect(page.getByText('Answer out loud as if it were the real thing')).toBeVisible()
  await expect(page.getByText(/stays in this browser tab/)).toBeVisible()
  await expect(startButton(page)).toBeVisible()
})

test('F3.2 pressing Start asks for the microphone and shows the allow hint while the browser has not answered', async ({
  page,
  request,
}) => {
  // A permission prompt that nobody has answered yet.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {})
  })
  await openPractice(page, request)
  await startButton(page).click()

  await expect(page.getByText('Allow microphone access')).toBeVisible()
  await expect(startButton(page)).toHaveCount(0)
})

test('F3.3 recording shows a Recording label, a timer counting up, Stop, Cancel take and the tab title', async ({
  page,
  request,
}) => {
  await openPractice(page, request)
  await startRecording(page)

  await expect(page.getByText('Recording', { exact: true })).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/^0:0\d$/)
  await expect(page.getByRole('button', { name: 'Cancel take' })).toBeVisible()
  await expect(page).toHaveTitle('● Recording · umless')
  await expect(page.getByRole('timer')).toHaveText(/^0:0[1-9]$/, { timeout: 5000 })
})

test('F3.3 the live input-level meter is shown while recording', async ({ page, request }) => {
  await openPractice(page, request)
  await startRecording(page)
  await expect(page.locator('.meter')).toBeVisible()
})

test('F3.3 the tab title goes back once recording stops', async ({ page, request }) => {
  await openPractice(page, request)
  await startRecording(page)
  await expect(page).toHaveTitle('● Recording · umless')
  await page.waitForTimeout(800)
  await stopButton(page).click()
  await expect(page).not.toHaveTitle(/Recording/)
})

test('F3.3 Space stops the recording and opens the review', async ({ page, request }) => {
  await openPractice(page, request)
  await startRecording(page)
  await page.waitForTimeout(1000)
  await page.keyboard.press('Space')

  await expect(transcribeButton(page)).toBeVisible()
  await expect(stopButton(page)).toHaveCount(0)
})

test('F3.3 Space on the ready screen starts recording', async ({ page, request }) => {
  await openPractice(page, request)
  await expect(startButton(page)).toBeVisible()
  await page.keyboard.press('Space')
  await expect(stopButton(page)).toBeVisible()
})

test('F3.3 Cancel take asks first, and Discard returns to the ready screen', async ({ page, request }) => {
  await openPractice(page, request)
  await startRecording(page)
  await page.getByRole('button', { name: 'Cancel take' }).click()

  await expect(dialog(page)).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Discard' }).click()
  await expect(startButton(page)).toBeVisible()
  await expect(downloadAudio(page)).toHaveCount(0)
})

test('F3.4 in the final minute the timer reads "Time left" in the warning colour and a screen-reader announcement plays', async ({
  page,
  request,
}) => {
  await page.clock.install()
  await openPractice(page, request)
  await startRecording(page)
  await expect(page.getByRole('timer')).toHaveText(/^0:\d\d$/)

  await page.clock.fastForward('09:13')

  const timer = page.getByRole('timer')
  await expect(timer).toHaveText(/^Time left 0:\d\d$/)
  await expect(timer).toHaveClass(/warn/)
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: '1 minute left' })).toHaveCount(1)
})

test('F3.4 at 0:10 left the announcement changes to "10 seconds left"', async ({ page, request }) => {
  await page.clock.install()
  await openPractice(page, request)
  await startRecording(page)
  await page.clock.fastForward('09:13')
  await expect(page.getByRole('timer')).toHaveText(/^Time left/)
  await page.clock.fastForward('00:40')
  await expect(page.locator('[aria-live="polite"]').filter({ hasText: '10 seconds left' })).toHaveCount(1)
})

test('F3.5 Stop opens the review with the player, the duration and no auto-stop notice', async ({ page, request }) => {
  await openPractice(page, request)
  await recordAndStop(page)

  await expect(page.locator('audio')).toBeVisible()
  await expect(page.locator('.player .time')).toHaveText(/^0:0\d$/)
  await expect(page.getByText('Stopped at the 10-minute limit')).toHaveCount(0)
})

test('F3.5 at 10:00 the recording stops by itself with the "Stopped at the 10-minute limit" notice', async ({
  page,
  request,
}) => {
  await page.clock.install()
  await openPractice(page, request)
  await startRecording(page)
  // Real time for the fake microphone to produce audio; the 10 minutes themselves are fast-forwarded.
  await page.waitForTimeout(1500)
  await page.clock.fastForward('09:13')
  await page.clock.fastForward('01:00')

  await expect(page.getByText('Stopped at the 10-minute limit')).toBeVisible()
  await expect(transcribeButton(page)).toBeVisible()
  await expect(stopButton(page)).toHaveCount(0)
})

test('F3.6 the review offers Transcribe, Record again, Download audio and a not-saved reminder', async ({ page, request }) => {
  await openPractice(page, request)
  await recordAndStop(page)

  await expect(transcribeButton(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record again' })).toBeVisible()
  await expect(downloadAudio(page)).toBeVisible()
  await expect(page.getByText(/Not saved anywhere yet/)).toBeVisible()
})

test('F3.6 Download audio offers the recording as a named audio file', async ({ page, request }) => {
  await openPractice(page, request)
  await recordAndStop(page)

  const [download] = await Promise.all([page.waitForEvent('download'), downloadAudio(page).click()])
  expect(download.suggestedFilename()).toMatch(/^tell-me-about-yourself-\d{8}-\d{6}\.(webm|ogg|m4a)$/)
})

test('F3.6 Record again on an unsaved take asks first, and confirming returns to the ready screen', async ({ page, request }) => {
  await openPractice(page, request)
  await recordAndStop(page)
  await page.getByRole('button', { name: 'Record again' }).click()

  await expect(dialog(page)).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Record again' }).click()
  await expect(startButton(page)).toBeVisible()
})

test('F3.7 while transcribing a spinner and the wait text show, the player stays, and Transcribe is gone or disabled', async ({
  page,
  request,
}) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  await page.route(TRANSCRIPTIONS, async (route) => {
    await gate
    await route.continue()
  })
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()

  await expect(page.getByText('Transcribing…')).toBeVisible()
  await expect(page.getByText('Usually a few seconds')).toBeVisible()
  await expect(page.locator('.spinner')).toBeVisible()
  await expect(page.locator('audio')).toBeVisible()
  await expect(transcribeButton(page).and(page.locator(':enabled'))).toHaveCount(0)
  release()
  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
})

test('F3.7 a second click on Transcribe is ignored: only one request is sent', async ({ page, request }) => {
  let calls = 0
  await page.route(TRANSCRIPTIONS, async (route) => {
    calls += 1
    await new Promise((r) => setTimeout(r, 800))
    await route.continue()
  })
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page)
    .dblclick({ force: true })
    .catch(() => {})
  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
  expect(calls).toBe(1)
})

test('F3.8 a successful transcription shows the transcript', async ({ page, request }) => {
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()

  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
  await expect(transcribeButton(page)).toHaveCount(0)
})

test('E1 a denied microphone shows the "needs your microphone" help and Try again re-requests permission', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __mic: number }
    w.__mic = 0
    navigator.mediaDevices.getUserMedia = () => {
      w.__mic += 1
      return Promise.reject(new DOMException('no', 'NotAllowedError'))
    }
  })
  await openPractice(page, request)
  await startButton(page).click()

  await expect(page.getByText('umless needs your microphone')).toBeVisible()
  await expect(page.getByText(/Microphone/).first()).toBeVisible()
  await tryAgainButton(page).click()
  await expect(page.getByText('umless needs your microphone')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(2)
})

test('E2 with no microphone the user sees "No microphone found" and can try again', async ({ page, request }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotFoundError'))
  })
  await openPractice(page, request)
  await startButton(page).click()

  await expect(page.getByText('No microphone found')).toBeVisible()
  await expect(page.getByText(/system sound settings/)).toBeVisible()
  await expect(tryAgainButton(page)).toBeVisible()
})

test('E3 a browser that cannot record sees the unsupported message with a way back to the questions', async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder
  })
  await openPractice(page, request)

  await expect(page.getByText(/browser can't record audio/)).toBeVisible()
  await expect(startButton(page)).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to questions', exact: true }).click()
  await expect(page).toHaveURL(/\/questions$/)
})

test('E8 when the server cannot be reached the error is shown and the recording is kept', async ({ page, request }) => {
  await page.route(TRANSCRIPTIONS, (route) => route.abort())
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()

  await expect(page.getByText("Can't reach the umless server")).toBeVisible()
  await expect(page.locator('audio')).toBeVisible()
  await expect(tryAgainButton(page)).toBeVisible()
  await expect(downloadAudio(page)).toBeVisible()
})

test('E8 Try again after an unreachable server transcribes the kept recording', async ({ page, request }) => {
  await page.route(TRANSCRIPTIONS, (route) => route.abort(), { times: 1 })
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()
  await expect(page.getByText("Can't reach the umless server")).toBeVisible()
  await tryAgainButton(page).click()

  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
})

test('E9 a Deepgram failure (502) says transcription failed, keeps the recording and offers Try again', async ({
  page,
  request,
}) => {
  await failTranscription(page, 502, { code: 'transcription_failed', detail: 'upstream failed' })
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()

  await expect(page.getByText('Transcription failed')).toBeVisible()
  await expect(page.getByText(/Try again in a moment/)).toBeVisible()
  await expect(page.locator('audio')).toBeVisible()
  await expect(tryAgainButton(page)).toBeVisible()
})

test('E10 transcription unavailable (503) says so, keeps the recording and offers Download audio', async ({
  page,
  request,
}) => {
  await failTranscription(page, 503, { code: 'transcription_unavailable', detail: 'no key' })
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()

  await expect(page.getByText('Transcription is unavailable')).toBeVisible()
  await expect(page.getByText(/Your recording is safe: try again later/)).toBeVisible()
  await expect(page.locator('audio')).toBeVisible()
  await expect(downloadAudio(page)).toBeVisible()
})

test('E11 a too-large recording (413) says it is over 25 MB, keeps it and offers Record again and Download audio', async ({
  page,
  request,
}) => {
  await failTranscription(page, 413, { code: 'audio_too_large', detail: 'too big' })
  await openPractice(page, request)
  await recordAndStop(page)
  await transcribeButton(page).click()

  await expect(page.getByText('This recording is over 25 MB')).toBeVisible()
  await expect(page.getByText(/Record a shorter answer/)).toBeVisible()
  await expect(page.locator('audio')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Record again' })).toBeVisible()
  await expect(downloadAudio(page)).toBeVisible()
})

test('E15 leaving while recording asks "Stop and discard this recording?" and Keep recording stays', async ({
  page,
  request,
}) => {
  await openPractice(page, request)
  await startRecording(page)
  await page.getByRole('link', { name: /Questions/ }).first().click()

  await expect(dialog(page).getByRole('heading', { name: 'Stop and discard this recording?' })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Keep recording' })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Stop & review' })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Discard' })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Keep recording' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(stopButton(page)).toBeVisible()
  await expect(page).toHaveURL(/\/practice\//)
})

test('E15 Stop & review from the leave dialog opens the review of what was recorded', async ({ page, request }) => {
  await openPractice(page, request)
  await startRecording(page)
  await page.waitForTimeout(1000)
  await page.getByRole('link', { name: /Questions/ }).first().click()
  await dialog(page).getByRole('button', { name: 'Stop & review' }).click()

  await expect(transcribeButton(page)).toBeVisible()
  await expect(page).toHaveURL(/\/practice\//)
})

test('E15 Discard from the leave dialog leaves for the questions list', async ({ page, request }) => {
  await openPractice(page, request)
  await startRecording(page)
  await page.getByRole('link', { name: /Questions/ }).first().click()
  await dialog(page).getByRole('button', { name: 'Discard' }).click()

  await expect(page).toHaveURL(/\/questions$/)
  await expect(page.locator('.q-row .text')).toHaveText([QUESTION])
})

test('E16 an unknown question id shows "That question doesn\'t exist any more" with a way back', async ({ page }) => {
  await page.goto('/practice/does-not-exist')

  await expect(page.getByText("That question doesn't exist any more")).toBeVisible()
  await page.getByRole('link', { name: 'Back to questions', exact: true }).click()
  await expect(page).toHaveURL(/\/questions$/)
})

test('E16 a deleted question id shows the not-found message', async ({ page, request }) => {
  const [question] = await seedQuestions(request, [QUESTION])
  await request.delete(`/api/questions/${question.id}`)
  await page.goto(`/practice/${question.id}`)

  await expect(page.getByText("That question doesn't exist any more")).toBeVisible()
})

// The fake transcriber accepts any body, so check the upload itself is the WebM recording.
test('F3.7 Transcribe uploads the recorded audio as the raw request body', async ({ page, request }) => {
  await resetQuestions(request)
  const [question] = await seedQuestions(request, ['Tell me about yourself.'])
  let upload: { contentType?: string; size: number; head: string } | undefined
  await page.route(TRANSCRIPTIONS, async (route) => {
    const body = route.request().postDataBuffer()
    upload = {
      contentType: route.request().headers()['content-type'],
      size: body?.length ?? 0,
      head: body?.subarray(0, 4).toString('hex') ?? '',
    }
    await route.continue()
  })
  await page.goto(`/practice/${question.id}`)
  await page.getByRole('button', { name: 'Start recording' }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await page.getByRole('button', { name: 'Transcribe' }).click()
  await expect(page.getByText(/fake transcript/)).toBeVisible()

  expect(upload?.contentType).toMatch(/^audio\/webm/)
  expect(upload?.size).toBeGreaterThan(1000)
  expect(upload?.head).toBe('1a45dfa3') // WebM/EBML signature
})
