import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resetQuestions, seedQuestions } from './helpers'

// docs/design/flows.md, F4: Reviewing and keeping it (steps 1-8) and edge cases E12, E13, E14.

const QUESTION = 'Tell me about yourself'
const FAKE_TRANSCRIPT = 'So, um, . this is a fake transcript.'

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test.beforeEach(async ({ request }) => {
  await resetQuestions(request)
})

type Request = Parameters<typeof seedQuestions>[0]

const dialog = (page: Page) => page.getByRole('alertdialog')
const downloadTranscript = (page: Page) => page.getByRole('link', { name: /Download transcript/ })
const downloadAudio = (page: Page) => page.getByRole('link', { name: /Download audio/ })
const practiseAgain = (page: Page) => page.getByRole('button', { name: 'Practise again' })
const nextQuestion = (page: Page) => page.getByRole('link', { name: /Next question/ })
const backToQuestions = (page: Page) => page.getByRole('link', { name: /Questions/ }).first()
const startButton = (page: Page) => page.getByRole('button', { name: 'Start recording' })

/** Opens the first question from the list, so the browser has a page to go Back to. */
async function openFromList(page: Page, request: Request, texts = [QUESTION]) {
  const questions = await seedQuestions(request, texts)
  await page.goto('/')
  await page.getByRole('link', { name: /Practise/ }).first().click()
  await expect(startButton(page)).toBeVisible()
  return questions
}

/** Records with the fake microphone and clicks Transcribe. */
async function recordAndTranscribe(page: Page) {
  await startButton(page).click()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await page.getByRole('button', { name: 'Transcribe', exact: true }).click()
}

async function reachResult(page: Page, request: Request, texts = [QUESTION]) {
  const questions = await openFromList(page, request, texts)
  await recordAndTranscribe(page)
  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
  return questions
}

function transcriptBody(words: { text: string; start: number; end: number }[], duration: number) {
  return {
    text: words.map((w) => w.text).join(' '),
    words: words.map((w) => ({
      word: w.text.toLowerCase().replace(/[^a-z]/g, '') || 'x',
      punctuated_word: w.text,
      start: w.start,
      end: w.end,
      confidence: 0.9,
      is_filler: false,
      pause_before_seconds: 0,
    })),
    duration_seconds: duration,
    summary: {
      word_count: words.length,
      filler_count: 0,
      fillers: [],
      words_per_minute: words.length ? Math.round((words.length / duration) * 60) : null,
      fillers_per_minute: 0,
      pause_count: 0,
      longest_pause_seconds: null,
    },
  }
}

function fulfilTranscript(page: Page, body: unknown) {
  return page.route('**/api/transcriptions', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  )
}

test('F4.1 the result shows the question, the summary bar, the highlighted transcript and the audio player', async ({
  page,
  request,
}) => {
  await reachResult(page, request)

  await expect(page.getByText(QUESTION, { exact: true })).toBeVisible()
  const summary = page.getByLabel('Summary')
  await expect(summary).toBeVisible()
  await expect(summary.getByText(/^Length$/)).toBeVisible()
  await expect(summary.getByText('Pace')).toBeVisible()
  await expect(summary.getByText('"um"')).toBeVisible()
  await expect(summary.getByText(/Long pauses/)).toBeVisible()
  await expect(summary.getByText(/longest 1\.2 s/)).toBeVisible()
  await expect(page.locator('.transcript .body mark.filler')).toHaveText(['um,'])
  await expect(page.locator('.transcript .body .pause')).toHaveCount(1)
  await expect(page.locator('audio')).toBeVisible()
})

test('F4.2 the recording can be played from the result', async ({ page, request }) => {
  await reachResult(page, request)

  const audio = page.locator('audio')
  await expect(audio).toBeVisible()
  await audio.evaluate((el: HTMLAudioElement) => el.play())
  await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0)
})

test('F4.3 Download transcript saves a dated .txt: question, blank line, transcript, blank line, summary line', async ({
  page,
  request,
}) => {
  await reachResult(page, request)
  const [download] = await Promise.all([page.waitForEvent('download'), downloadTranscript(page).click()])

  expect(download.suggestedFilename()).toMatch(/^tell-me-about-yourself-\d{8}-\d{6}\.txt$/)
  const lines = readFileSync(await download.path(), 'utf8').split('\n')
  expect(lines[0]).toBe(QUESTION)
  expect(lines[1]).toBe('')
  expect(lines[2]).toBe(FAKE_TRANSCRIPT)
  expect(lines[3]).toBe('')
  expect(lines[4]).toMatch(/\d+:\d\d/)
  expect(lines[4]).toMatch(/um/)
})

test('F4.4 Download audio saves a dated audio file named after the question', async ({ page, request }) => {
  await reachResult(page, request)
  const [download] = await Promise.all([page.waitForEvent('download'), downloadAudio(page).click()])

  expect(download.suggestedFilename()).toMatch(/^tell-me-about-yourself-\d{8}-\d{6}\.(webm|ogg|m4a)$/)
})

test('F4.3/F4.4 the transcript and the audio downloads share the same date-time stamp', async ({ page, request }) => {
  await reachResult(page, request)
  const [txt] = await Promise.all([page.waitForEvent('download'), downloadTranscript(page).click()])
  const [audio] = await Promise.all([page.waitForEvent('download'), downloadAudio(page).click()])

  const stamp = (name: string) => name.replace(/\.\w+$/, '')
  expect(stamp(audio.suggestedFilename())).toBe(stamp(txt.suggestedFilename()))
})

test('F4.5 Copy transcript shows a "Copied" toast and puts the transcript on the clipboard', async ({ page, request }) => {
  await reachResult(page, request)
  await page.getByRole('button', { name: /Copy transcript/ }).click()

  await expect(page.getByText(/Copied/)).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(FAKE_TRANSCRIPT)
})

test('F4.6 Practise again after downloading goes straight to the ready screen for the same question', async ({
  page,
  request,
}) => {
  const [question] = await reachResult(page, request)
  await Promise.all([page.waitForEvent('download'), downloadAudio(page).click()])
  await practiseAgain(page).click()

  await expect(dialog(page)).toHaveCount(0)
  await expect(startButton(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: QUESTION })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/practice/${question.id}$`))
})

test('F4.6 Practise again with nothing downloaded asks "Leave without saving?" first', async ({ page, request }) => {
  await reachResult(page, request)
  await practiseAgain(page).click()

  await expect(dialog(page).getByRole('heading', { name: 'Leave without saving?' })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Stay' })).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: /Download audio/ })).toBeVisible()
  await expect(startButton(page)).toHaveCount(0)
  await dialog(page).getByRole('button', { name: 'Leave' }).click()
  await expect(startButton(page)).toBeVisible()
})

test('F4.7 Next question goes to the ready screen of the next question in the list', async ({ page, request }) => {
  const questions = await reachResult(page, request, [QUESTION, 'Why this company'])
  await Promise.all([page.waitForEvent('download'), downloadTranscript(page).click()])
  await nextQuestion(page).click()

  await expect(page).toHaveURL(new RegExp(`/practice/${questions[1].id}$`))
  await expect(page.getByRole('heading', { name: 'Why this company' })).toBeVisible()
  await expect(startButton(page)).toBeVisible()
})

test('F4.7 Next question is hidden on the last question', async ({ page, request }) => {
  await reachResult(page, request)
  await expect(practiseAgain(page)).toBeVisible()
  await expect(nextQuestion(page)).toHaveCount(0)
})

test('F4.8 Back to questions after downloading goes straight to the list', async ({ page, request }) => {
  await reachResult(page, request)
  await Promise.all([page.waitForEvent('download'), downloadTranscript(page).click()])
  await backToQuestions(page).click()

  await expect(dialog(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('.q-row .text')).toHaveText([QUESTION])
})

test('F4.8 Back to questions with nothing downloaded asks first; Stay keeps the result, Leave goes to the list', async ({
  page,
  request,
}) => {
  await reachResult(page, request)
  await backToQuestions(page).click()

  await expect(dialog(page).getByRole('heading', { name: 'Leave without saving?' })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Stay' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
  await backToQuestions(page).click()
  await dialog(page).getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test("E12 a transcript with no words shows \"We couldn't hear any words\", hides the summary and offers Practise again and audio", async ({
  page,
  request,
}) => {
  await fulfilTranscript(page, transcriptBody([], 3))
  await openFromList(page, request)
  await recordAndTranscribe(page)

  await expect(page.getByText("We couldn't hear any words")).toBeVisible()
  await expect(page.getByText(/closer to the microphone/)).toBeVisible()
  await expect(page.getByLabel('Summary')).toHaveCount(0)
  await expect(page.getByText('How it went')).toHaveCount(0)
  await expect(practiseAgain(page)).toBeVisible()
  await expect(downloadAudio(page)).toBeVisible()
  await practiseAgain(page).click()
  await dialog(page).getByRole('button', { name: 'Leave' }).click()
  await expect(startButton(page)).toBeVisible()
})

test('E13 a very long transcript scrolls inside its card (max 60vh) while the summary stays visible', async ({
  page,
  request,
}) => {
  const words = Array.from({ length: 1500 }, (_, i) => ({ text: `word${i}`, start: i * 0.4, end: i * 0.4 + 0.3 }))
  await fulfilTranscript(page, transcriptBody(words, 600))
  await openFromList(page, request)
  await recordAndTranscribe(page)

  const body = page.locator('.transcript .body')
  await expect(body).toBeVisible()
  const metrics = await body.evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    overflow: getComputedStyle(el).overflowY,
  }))
  const viewport = page.viewportSize()!.height
  expect(metrics.scroll).toBeGreaterThan(metrics.client)
  expect(['auto', 'scroll']).toContain(metrics.overflow)
  expect(metrics.client).toBeLessThanOrEqual(viewport * 0.6 + 1)
  await expect(page.getByLabel('Summary')).toBeInViewport()
  await body.evaluate((el) => (el.scrollTop = el.scrollHeight))
  await expect(page.getByLabel('Summary')).toBeInViewport()
  await expect(page.getByText('word1499')).toBeInViewport()
})

test('E14 the browser Back button with nothing downloaded asks "Leave without saving?"; Stay keeps the result', async ({
  page,
  request,
}) => {
  await reachResult(page, request)
  await page.goBack()

  await expect(dialog(page).getByRole('heading', { name: 'Leave without saving?' })).toBeVisible()
  await expect(dialog(page).getByText(/stored anywhere/)).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Stay' }).click()
  await expect(page.getByText(FAKE_TRANSCRIPT)).toBeVisible()
  await expect(page).toHaveURL(/\/practice\//)
})

test('E14 the browser Back button leaves for the list when Leave is chosen', async ({ page, request }) => {
  await reachResult(page, request)
  await page.goBack()
  await dialog(page).getByRole('button', { name: 'Leave' }).click()

  await expect(page).toHaveURL(/\/$/)
})

test('E14 the browser Back button goes straight through after the audio was downloaded', async ({ page, request }) => {
  await reachResult(page, request)
  await Promise.all([page.waitForEvent('download'), downloadAudio(page).click()])
  await page.goBack()

  await expect(page).toHaveURL(/\/$/)
  await expect(dialog(page)).toHaveCount(0)
})

test('E14 Download audio inside the leave dialog saves the audio', async ({ page, request }) => {
  await reachResult(page, request)
  await backToQuestions(page).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog(page).getByRole('button', { name: /Download audio/ }).click(),
  ])

  expect(download.suggestedFilename()).toMatch(/\.(webm|ogg|m4a)$/)
})

test('E14 Next question with nothing downloaded asks "Leave without saving?" first', async ({ page, request }) => {
  const questions = await reachResult(page, request, [QUESTION, 'Why this company'])
  await nextQuestion(page).click()

  await expect(dialog(page).getByRole('heading', { name: 'Leave without saving?' })).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Leave' }).click()
  await expect(page).toHaveURL(new RegExp(`/practice/${questions[1].id}$`))
})

test('E14 Next question goes straight through after the transcript was downloaded', async ({ page, request }) => {
  const questions = await reachResult(page, request, [QUESTION, 'Why this company'])
  await Promise.all([page.waitForEvent('download'), downloadTranscript(page).click()])
  await nextQuestion(page).click()

  await expect(dialog(page)).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/practice/${questions[1].id}$`))
})
