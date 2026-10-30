import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  ...boundaries(),
)

// Import rules (docs/adr/0002-frontend-architecture.md decision 1, docs/adr/0005-frontend-v2-architecture.md
// decision 1). Flat config replaces a rule per block instead of merging it, so each layer's block
// lists the shared restrictions plus its own.
function boundaries() {
  const tests = 'src/**/*.test.{ts,tsx}'
  const shared = {
    paths: [{ name: 'openapi-fetch', message: 'Requests go through src/shared/api/client.ts and a *Api.ts module.' }],
    patterns: [
      {
        regex: '^@/shared/api/client$',
        importNames: ['client', 'unwrap'],
        message: 'Only *Api.ts modules call the API client. Import a function from one instead (ApiError is fine).',
      },
      {
        regex: '^@/features/[^/]+/.+',
        message: "Import another feature through its index ('@/features/<name>'), never a file inside it.",
      },
    ],
  }
  const above = (layers, why) => ({ regex: `^@/(${layers})(/|$)`, message: why })
  const rule = (...extra) => ['error', { paths: shared.paths, patterns: [...shared.patterns, ...extra] }]
  const apiModules = ['src/shared/api/client.ts', 'src/**/*Api.ts']
  return [
    { files: ['src/**/*.{ts,tsx}'], ignores: [tests, ...apiModules], rules: { 'no-restricted-imports': rule() } },
    {
      files: ['src/shared/**/*.{ts,tsx}', 'src/content/**/*.ts'],
      ignores: [tests, ...apiModules],
      rules: { 'no-restricted-imports': rule(above('app|pages|features', 'shared and content are the bottom layer: they import nothing from app, pages or features.')) },
    },
    {
      files: ['src/features/**/*.{ts,tsx}'],
      ignores: [tests, ...apiModules],
      rules: { 'no-restricted-imports': rule(above('app|pages', 'Features never import pages or app; pass what they need in as props.')) },
    },
    {
      files: ['src/pages/**/*.{ts,tsx}'],
      ignores: [tests],
      rules: { 'no-restricted-imports': rule(above('app', 'Pages never import app; the route table imports them.')) },
    },
    {
      // *Api.ts modules may use the client, but the layer rules still hold for them.
      files: apiModules,
      ignores: [tests],
      rules: {
        'no-restricted-imports': ['error', { patterns: [shared.patterns[1], above('app|pages', 'API modules sit below pages and app.')] }],
      },
    },
  ]
}
