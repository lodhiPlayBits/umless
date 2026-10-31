import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// E2E runs against its own backend and dev server on spare ports, so it never touches the
// backend on 8000, the dev server on 5173, or your real questions file.
const API_PORT = 8766
const WEB_PORT = 5175
const dataFile = join(mkdtempSync(join(tmpdir(), 'umless-e2e-')), 'questions.json')
const python =
  process.env.UMLESS_PYTHON ??
  (process.platform === 'win32' ? join('.venv', 'Scripts', 'python.exe') : join('.venv', 'bin', 'python'))

export default defineConfig({
  testDir: './tests/e2e',
  // One shared backend: tests reset the question list, so they can't run in parallel.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          // A fake microphone, so the practice flows can record without real hardware.
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      // Empty values override backend/.env: no MySQL, sign-in, bucket or payments, just the temp file.
      env: {
        UMLESS_TRANSCRIBER: 'fake',
        UMLESS_DATA_FILE: dataFile,
        DB_HOST: '',
        CLERK_PUBLISHABLE_KEY: '',
        OCI_BUCKET: '',
        OCI_NAMESPACE: '',
        OCI_REGION: '',
        RAZORPAY_KEY_ID: '',
        RAZORPAY_KEY_SECRET: '',
        RAZORPAY_WEBHOOK_SECRET: '',
        // Limits in memory, not the production Redis named in backend/.env.
        REDIS_URL: '',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { UMLESS_API_URL: `http://127.0.0.1:${API_PORT}`, VITE_CLERK_PUBLISHABLE_KEY: '' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
