/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // UMLESS_API_URL lets e2e tests and checks use a throwaway backend instead of the one on 8000.
  const env = loadEnv(mode, '.', 'UMLESS_')
  return {
    plugins: [react()],
    // '@/…' is src/ (docs/adr/0005-frontend-v2-architecture.md); tsconfig.app.json has the same alias.
    resolve: { alias: [{ find: /^@\//, replacement: '/src/' }] },
    server: {
      // The app is same-origin; Vite's default CORS would let other localhost pages call /api.
      cors: false,
      // 127.0.0.1, not localhost: Node may resolve localhost to ::1 while uvicorn listens on IPv4.
      proxy: { '/api': env.UMLESS_API_URL || 'http://127.0.0.1:8000' },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['**/node_modules/**', 'tests/e2e/**'],
      // `npm test -- --coverage` (CI): lcov for SonarCloud, with paths from the repo root.
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/shared/api/generated/**', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
        reporter: [['lcov', { projectRoot: '..' }], 'text-summary'],
      },
    },
  }
})
