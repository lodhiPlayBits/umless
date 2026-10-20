import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppCrash from './AppCrash'
import ErrorBoundary from './components/ErrorBoundary'
import { rootErrorOptions } from './reportError'

createRoot(document.getElementById('root')!, rootErrorOptions).render(
  <StrictMode>
    <ErrorBoundary fallback={<AppCrash />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
