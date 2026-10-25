import { getToken } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppCrash from './AppCrash'
import { sendTokensFrom } from './client'
import ErrorBoundary from './components/ErrorBoundary'
import { rootErrorOptions } from './reportError'
import SignInGate from './SignInGate'

// Set at build time (frontend/.env). Without it there is no sign-in: local, single-user use.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
if (publishableKey) sendTokensFrom(() => getToken())

createRoot(document.getElementById('root')!, rootErrorOptions).render(
  <StrictMode>
    <ErrorBoundary fallback={<AppCrash />}>
      {publishableKey ? (
        <SignInGate publishableKey={publishableKey}>
          <App />
        </SignInGate>
      ) : (
        <App />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
