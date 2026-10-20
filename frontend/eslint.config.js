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
  {
    // docs/adr/0002-frontend-architecture.md: only the *Api.ts modules make requests.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/client.ts', 'src/**/*Api.ts', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'openapi-fetch', message: 'Requests go through src/client.ts and a *Api.ts module.' }],
          patterns: [
            {
              regex: '^\\.{1,2}/(.*/)?client(\\.ts)?$',
              importNames: ['client', 'unwrap'],
              message: 'Only *Api.ts modules call the API client. Import a function from one instead (ApiError is fine).',
            },
          ],
        },
      ],
    },
  },
)
