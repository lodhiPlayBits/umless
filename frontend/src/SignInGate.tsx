import { ClerkLoading, ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'
import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const SignInOn = createContext(false)

/** The signed-in user's avatar and account menu; nothing when sign-in is off (local use). */
export function AccountMenu() {
  return useContext(SignInOn) ? <UserButton /> : null
}

function SignedOut() {
  return (
    <>
      <header className="app-header">
        <span className="logo">
          um<span>less</span>
        </span>
      </header>
      <main>
        <div className="empty">
          <h1>Practise saying it out loud</h1>
          <p className="muted">
            Record your answers and see every "um", "uh" and long pause. Sign in to keep your own question list.
          </p>
          <div className="actions sign-in-actions">
            <SignInButton mode="modal">
              <button type="button" className="btn btn-primary">
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button type="button" className="btn">
                Create account
              </button>
            </SignUpButton>
          </div>
        </div>
      </main>
    </>
  )
}

/**
 * Clerk sign-in in front of the whole app. Signing out unmounts the app, so nothing of one
 * user's questions or takes stays on screen or in memory for the next one.
 */
export default function SignInGate({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <ClerkLoading>
        <p className="muted loading-auth" role="status">
          Loading…
        </p>
      </ClerkLoading>
      <SignInOn.Provider value={true}>
        <Show when="signed-in" fallback={<SignedOut />}>
          {children}
        </Show>
      </SignInOn.Provider>
    </ClerkProvider>
  )
}
