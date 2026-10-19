import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { resetQuestions, seedQuestions } from './helpers'

// docs/design/flows.md, F1: First visit and building the list.

test.beforeEach(async ({ request }) => {
  await resetQuestions(request)
})

const newQuestion = (page: Page) => page.getByLabel('New question')
const addButton = (page: Page) => page.getByRole('button', { name: /^Add/ })
const rowTexts = (page: Page) => page.locator('.q-row .text')

test('F1.1 first visit shows the intro and a focused New question field', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Add the questions you want to practise', { exact: false })).toBeVisible()
  await expect(page.getByText('No questions yet.')).toBeVisible()
  await expect(newQuestion(page)).toBeEnabled()
  await expect(newQuestion(page)).toBeFocused()
})

test('F1.2 creating the first question appends it and clears the field', async ({ page }) => {
  await page.goto('/')
  await newQuestion(page).fill('Tell me about yourself')
  await addButton(page).click()

  await expect(rowTexts(page)).toHaveText(['Tell me about yourself'])
  await expect(page.getByText('1 question', { exact: true })).toBeVisible()
  await expect(page.getByText('No questions yet.')).toHaveCount(0)
  await expect(newQuestion(page)).toHaveValue('')

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['Tell me about yourself'])
})

test('F1.2 pressing Enter adds the question', async ({ page }) => {
  await page.goto('/')
  await newQuestion(page).fill('Why this job?')
  await newQuestion(page).press('Enter')
  await expect(rowTexts(page)).toHaveText(['Why this job?'])
})

test('F1.3 adding several questions grows the list, newest at the bottom, with a count', async ({ page }) => {
  await page.goto('/')
  for (const text of ['First question', 'Second question', 'Third question']) {
    await newQuestion(page).fill(text)
    await addButton(page).click()
    await expect(rowTexts(page).last()).toHaveText(text)
  }
  await expect(rowTexts(page)).toHaveText(['First question', 'Second question', 'Third question'])
  await expect(page.getByText('3 questions', { exact: true })).toBeVisible()

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['First question', 'Second question', 'Third question'])
})

test('F1.4 a blank field keeps Add disabled and shows no error', async ({ page }) => {
  await page.goto('/')
  await expect(addButton(page)).toBeDisabled()

  await newQuestion(page).fill('   ')
  await expect(addButton(page)).toBeDisabled()
  await expect(page.locator('.field-msg')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)

  await newQuestion(page).press('Enter')
  await expect(page.locator('.q-row')).toHaveCount(0)
})

test('F1.5 a question over 500 characters shows an inline error and Add is disabled', async ({ page }) => {
  await page.goto('/')
  await newQuestion(page).fill('a'.repeat(512))
  await expect(page.getByText(/Keep questions under 500 characters/)).toBeVisible()
  await expect(page.getByText(/512/)).toBeVisible()
  await expect(addButton(page)).toBeDisabled()

  await newQuestion(page).press('Enter')
  await expect(page.locator('.q-row')).toHaveCount(0)

  // Fixing the text clears the error and enables Add.
  await newQuestion(page).fill('a'.repeat(500))
  await expect(page.getByText(/Keep questions under 500 characters/)).toHaveCount(0)
  await expect(addButton(page)).toBeEnabled()
})

test('F1.5 a live character counter appears from 450 characters', async ({ page }) => {
  await page.goto('/')
  await newQuestion(page).fill('a'.repeat(449))
  await expect(page.getByText('449 / 500')).toHaveCount(0)
  await newQuestion(page).fill('a'.repeat(450))
  await expect(page.getByText('450 / 500')).toBeVisible()
})

test('F1.6 a duplicate (case and space insensitive) warns and offers Add anyway', async ({ page, request }) => {
  await seedQuestions(request, ['Tell me about yourself'])
  await page.goto('/')
  await newQuestion(page).fill('  TELL me   about yourself ')

  await expect(page.getByText('You already have this question')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add anyway' })).toBeEnabled()
  await expect(page.locator('.q-row')).toHaveCount(1)

  await page.getByRole('button', { name: 'Add anyway' }).click()
  await expect(page.locator('.q-row')).toHaveCount(2)
  await expect(page.getByText('2 questions', { exact: true })).toBeVisible()
  await expect(newQuestion(page)).toHaveValue('')
  await expect(page.getByText('You already have this question')).toHaveCount(0)
})

test('F1.7 save failure (server unreachable) shows an error, keeps the text, and allows retry', async ({ page }) => {
  await page.goto('/')
  let down = true
  await page.route('**/api/questions', (route) => {
    if (route.request().method() === 'POST' && down) return route.abort('connectionrefused')
    return route.fallback()
  })

  await newQuestion(page).fill('What would your last manager say about you?')
  await addButton(page).click()

  await expect(page.getByText(/Couldn't save\. Check that the backend is running/)).toBeVisible()
  await expect(newQuestion(page)).toHaveValue('What would your last manager say about you?')
  await expect(addButton(page)).toBeEnabled()
  await expect(page.locator('.q-row')).toHaveCount(0)

  // Retry once the server is back.
  down = false
  await addButton(page).click()
  await expect(rowTexts(page)).toHaveText(['What would your last manager say about you?'])
  await expect(newQuestion(page)).toHaveValue('')
})

test('F1.7 a 5xx response is also reported as a save failure', async ({ page }) => {
  await page.goto('/')
  await page.route('**/api/questions', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 502, body: 'Bad Gateway' }) : route.fallback(),
  )
  await newQuestion(page).fill('Some question')
  await addButton(page).click()

  await expect(page.getByText(/Couldn't save\. Check that the backend is running/)).toBeVisible()
  await expect(newQuestion(page)).toHaveValue('Some question')
  await expect(addButton(page)).toBeEnabled()
})

test('F1 Error: unreachable server shows the error screen, a disabled field, and Retry recovers', async ({ page, request }) => {
  await seedQuestions(request, ['Survives the outage'])
  let down = true
  await page.route('**/api/questions', (route) =>
    down && route.request().method() === 'GET' ? route.abort('connectionrefused') : route.fallback(),
  )
  await page.goto('/')

  await expect(page.getByText("Can't reach the umless server")).toBeVisible()
  await expect(page.getByText('python run.py')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  await expect(newQuestion(page)).toBeDisabled()

  down = false
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(rowTexts(page)).toHaveText(['Survives the outage'])
  await expect(page.getByText("Can't reach the umless server")).toHaveCount(0)
  await expect(newQuestion(page)).toBeEnabled()
})

test('F1 Error: a 5xx on load also shows the error screen', async ({ page }) => {
  await page.route('**/api/questions', (route) => route.fulfill({ status: 503, body: 'Service Unavailable' }))
  await page.goto('/')
  await expect(page.getByText("Can't reach the umless server")).toBeVisible()
  await expect(newQuestion(page)).toBeDisabled()
})
