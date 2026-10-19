import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { resetQuestions, seedQuestions } from './helpers'

// docs/design/flows.md, F2: Managing questions.

test.beforeEach(async ({ request }) => {
  await resetQuestions(request)
})

const rowTexts = (page: Page) => page.locator('.q-row .text')
const editField = (page: Page) => page.locator('input.edit-field')
const dialog = (page: Page) => page.getByRole('alertdialog')
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })

test('F2.1 the pencil turns the row into an inline field with Save and Cancel', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 2' }).click()

  await expect(editField(page)).toHaveValue('Beta')
  await expect(editField(page)).toBeFocused()
  await expect(saveButton(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
})

test('F2.1 double-clicking the text starts editing', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await rowTexts(page).first().dblclick()
  await expect(editField(page)).toHaveValue('Alpha')
})

test('F2.1 Esc cancels the edit and keeps the old text', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 1' }).click()
  await editField(page).fill('Changed')
  await editField(page).press('Escape')

  await expect(editField(page)).toHaveCount(0)
  await expect(rowTexts(page)).toHaveText(['Alpha'])
})

test('F2.1 the Cancel button cancels the edit', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 1' }).click()
  await editField(page).fill('Changed')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(rowTexts(page)).toHaveText(['Alpha'])
})

test('F2.1 a blank edit cannot be saved and shows no error', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 1' }).click()
  await editField(page).fill('   ')
  await expect(saveButton(page)).toBeDisabled()
  await expect(page.locator('.field-msg')).toHaveCount(0)
  await editField(page).press('Enter')
  await expect(editField(page)).toBeVisible()
})

test('F2.1 an edit over 500 characters shows the error and Save is disabled', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 1' }).click()
  await editField(page).fill('b'.repeat(512))
  await expect(page.getByText(/Keep questions under 500 characters/)).toBeVisible()
  await expect(page.getByText(/512/)).toBeVisible()
  await expect(saveButton(page)).toBeDisabled()
})

test('F2.1 an edit that duplicates another question warns', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 2' }).click()
  await editField(page).fill(' alpha ')
  await expect(page.getByText('You already have this question')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Save/ })).toBeEnabled()
})

test('F2.2 Enter saves the edit, shows a Saved tick, and the change persists', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta', 'Gamma'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 2' }).click()
  await editField(page).fill('Beta, revised')
  await editField(page).press('Enter')

  await expect(editField(page)).toHaveCount(0)
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta, revised', 'Gamma'])
  await expect(page.getByText('Saved')).toBeVisible()

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta, revised', 'Gamma'])
})

test('F2.2 the Save button saves the edit', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit question 1' }).click()
  await editField(page).fill('Alpha two')
  await saveButton(page).click()
  await expect(rowTexts(page)).toHaveText(['Alpha two'])
})

test('F2.2 a failed save keeps the row in edit mode with an inline error and the text', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha'])
  await page.goto('/')
  await page.route('**/api/questions/*', (route) =>
    route.request().method() === 'PATCH' ? route.abort('connectionrefused') : route.fallback(),
  )
  await page.getByRole('button', { name: 'Edit question 1' }).click()
  await editField(page).fill('Alpha, edited')
  await editField(page).press('Enter')

  await expect(page.getByRole('alert')).toContainText(/Couldn't save/)
  await expect(editField(page)).toHaveValue('Alpha, edited')
  await expect(saveButton(page)).toBeEnabled()

  await page.unroute('**/api/questions/*')
  await page.reload()
  await expect(rowTexts(page)).toHaveText(['Alpha'])
})

test('F2.3 Delete asks for confirmation, then removes the row and offers Undo', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Tell me about yourself', 'Gamma'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 2' }).click()

  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page)).toContainText('Tell me about yourself')
  await expect(rowTexts(page)).toHaveCount(3)

  await dialog(page).getByRole('button', { name: 'Delete' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Gamma'])
  await expect(page.getByText('2 questions', { exact: true })).toBeVisible()
  await expect(page.getByText('Question deleted')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Gamma'])
})

test('F2.3 Undo re-creates the question in the same position', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta', 'Gamma'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 2' }).click()
  await dialog(page).getByRole('button', { name: 'Delete' }).click()
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Gamma'])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta', 'Gamma'])

  await page.reload()
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta', 'Gamma'])
})

test('F2.3 the Undo toast goes away after about 5 seconds', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 1' }).click()
  await dialog(page).getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0, { timeout: 8000 })
  await expect(rowTexts(page)).toHaveText(['Beta'])
})

test('F2.4 Cancel in the delete dialog leaves the list unchanged', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 1' }).click()
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta'])
  await expect(page.getByText('Question deleted')).toHaveCount(0)
})

test('F2.4 Esc in the delete dialog leaves the list unchanged', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 1' }).click()
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta'])
})

test('F2.4 clicking outside the delete dialog leaves the list unchanged', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 1' }).click()
  await expect(dialog(page)).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(dialog(page)).toHaveCount(0)
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta'])
})

test('F2.5 a failed delete closes the dialog, keeps the row, and shows a toast', async ({ page, request }) => {
  await seedQuestions(request, ['Alpha', 'Beta'])
  await page.goto('/')
  await page.route('**/api/questions/*', (route) =>
    route.request().method() === 'DELETE' ? route.abort('connectionrefused') : route.fallback(),
  )
  await page.getByRole('button', { name: 'Delete question 1' }).click()
  await dialog(page).getByRole('button', { name: 'Delete' }).click()

  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByText("Couldn't delete. Try again.")).toBeVisible()
  await expect(rowTexts(page)).toHaveText(['Alpha', 'Beta'])
  await expect(page.getByText('Question deleted')).toHaveCount(0)
})

test('F2.6 deleting the last question shows the empty first-visit screen', async ({ page, request }) => {
  await seedQuestions(request, ['Only one'])
  await page.goto('/')
  await page.getByRole('button', { name: 'Delete question 1' }).click()
  await dialog(page).getByRole('button', { name: 'Delete' }).click()

  await expect(page.getByText('No questions yet.')).toBeVisible()
  await expect(page.locator('.q-row')).toHaveCount(0)
  await expect(page.getByLabel('New question')).toBeEnabled()

  await page.reload()
  await expect(page.getByText('No questions yet.')).toBeVisible()
})
