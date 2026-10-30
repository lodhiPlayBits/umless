import { ClerkProvider, useAuth } from '@clerk/react'
import type { ReactNode } from 'react'
import { navigate } from '@/shared/lib/router'
import { clerkAppearance } from '@/shared/theme'
import { PATHS } from '@/shared/config/paths'
import { SessionContext } from '@/shared/lib/session'

function FromClerk({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const status = !isLoaded ? 'loading' : isSignedIn ? 'signedIn' : 'signedOut'
  return <SessionContext.Provider value={{ auth: 'clerk', status }}>{children}</SessionContext.Provider>
}

/** Clerk sign-in for the deployed site. Clerk's own redirects go through our router (no reloads). */
export default function ClerkSession({ publishableKey, children }: { publishableKey: string; children: ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={clerkAppearance}
      signInUrl={PATHS.signIn}
      signUpUrl={PATHS.signUp}
      afterSignOutUrl={PATHS.landing}
      routerPush={(to) => navigate(to, { force: true })}
      routerReplace={(to) => navigate(to, { force: true, replace: true })}
    >
      <FromClerk>{children}</FromClerk>
    </ClerkProvider>
  )
}
