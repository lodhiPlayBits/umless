import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { resetQuestions, seedQuestions } from './helpers'

// Accessibility gate (docs/roadmap/2026-10-28-frontend-v2-build.md phase 10): every page, light and
// dark, phone and desktop, must have no serious or critical WCAG 2.2 AA violations. The landing
// and sign-in pages only render signed out, so they're checked against the deployed site instead.

const THEMES = ['light', 'dark'] as const
const WIDTHS = [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1280, height: 900 },
] as const

let ids: { question: string; take: string }

test.beforeAll(async ({ request }) => {
  await resetQuestions(request)
  const [question] = await seedQuestions(request, ['Tell me about yourself.', 'Why this role?'])
  const transcribed = await request.post(`/api/transcriptions?questionId=${question.id}`, {
    headers: { 'Content-Type': 'audio/webm' },
    data: Buffer.from([1, 2, 3, 4]),
  })
  ids = { question: question.id, take: (await transcribed.json()).take_id }
})

const pages = () => [
  ['dashboard', '/dashboard'],
  ['questions', '/questions'],
  ['practice', `/practice/${ids.question}`],
  ['history', '/history'],
  ['question progress', `/history/${ids.question}`],
  ['take', `/takes/${ids.take}`],
  ['settings', '/settings'],
  ['billing', '/settings/billing'],
  ['pricing', '/pricing'],
  ['terms', '/terms'],
  ['not found', '/no-such-page'],
]

for (const theme of THEMES) {
  for (const size of WIDTHS) {
    test(`no serious accessibility issues, ${theme}, ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.addInitScript((t) => localStorage.setItem('umless-theme', t), theme)
      const found: string[] = []
      for (const [name, path] of pages()) {
        await page.goto(path)
        await page.locator('main').first().waitFor()
        await page.waitForLoadState('networkidle')
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
        // A page that didn't render would "pass" with nothing to check.
        expect(results.passes.length, `${name}: axe found nothing to check`).toBeGreaterThan(10)
        console.log(`${theme} ${size.name} ${name}: ${results.passes.length} rules passed, ${results.violations.length} violations, ${results.incomplete.length} to review${results.incomplete.length ? ` (${results.incomplete.map((i) => `${i.id}: ${i.nodes.map((n) => n.target.join(' ')).slice(0, 2).join(' | ')}`).join('; ')})` : ''}`)
        for (const v of results.violations) {
          const line = `${name} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length}×: ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')})`
          console.log(line)
          if (v.impact === 'serious' || v.impact === 'critical') found.push(line)
        }
      }
      expect(found, found.join('\n')).toEqual([])
    })
  }
}
