import { ClerkLoading, ClerkProvider, Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'
import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import { resetAccount } from './billing/account'
import PracticeTime from './billing/PracticeTime'
import Footer from './legal/Footer'
import LegalPage from './legal/LegalPage'
import { PRICING } from './legal/business'
import Link from './Link'
import { parseRoute, usePathname } from './router'

const SignInOn = createContext(false)

/** Practice time left and the signed-in user's account menu; nothing when sign-in is off (local use). */
export function AccountMenu() {
  if (!useContext(SignInOn)) return null
  return (
    <>
      <PracticeTime />
      <UserButton />
    </>
  )
}

function SignedOut() {
  // The next person to sign in must not see the last one's practice time.
  useEffect(() => resetAccount(), [])
  // The legal pages are public: payment providers and visitors must read them without an account.
  const route = parseRoute(usePathname())
  return (
    <>
      <header className="app-header">
        <Link to="/" className="logo" aria-label="umless, home">
          um<span>less</span>
        </Link>
      </header>
      <main>
        {route.name === 'legal' ? <LegalPage page={route.page} /> : <Welcome />}
      </main>
      <Footer />
    </>
  )
}

function Welcome() {
  return (
    <>
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
      <section className="pricing" aria-labelledby="pricing-heading">
        <h2 id="pricing-heading">Pricing</h2>
        <p className="muted">{PRICING.free}. After that, buy practice time; it never expires.</p>
        <ul>
          {PRICING.packs.map((pack) => (
            <li key={pack.name} className="card">
              <strong>{pack.price}</strong>
              <span>
                {pack.name} · {pack.time}
              </span>
            </li>
          ))}
        </ul>
      </section>
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
