import { getToken } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/app/index.css'
import App from '@/app/App.tsx'
import AppCrash from '@/app/AppCrash'
import ClerkSession from '@/app/session/ClerkSession'
import { sendTokensFrom } from '@/shared/api/client'
import ErrorBoundary from '@/shared/ui/ErrorBoundary'
import { listenForUncaughtErrors, rootErrorOptions } from '@/shared/lib/reportError'

// Set at build time (frontend/.env). Without it there is no sign-in: local, single-user use.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (publishableKey) sendTokensFrom(() => getToken())
listenForUncaughtErrors()

createRoot(document.getElementById('root')!, rootErrorOptions).render(
  <StrictMode>
    <ErrorBoundary fallback={<AppCrash />}>
      {publishableKey ? (
        <ClerkSession publishableKey={publishableKey}>
          <App />
        </ClerkSession>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
