import { createContext, useContext } from 'react'

/**
 * Who is using the app, as the shell and route guards see it. Clerk provides it on the deployed
 * site (src/app/session/ClerkSession.tsx); without a Clerk key (local use, e2e) the one local
 * user is always signed in. Only src/app/session talks to Clerk's session; the rest reads this.
 */
export type Session = {
  auth: 'clerk' | 'local'
  status: 'loading' | 'signedIn' | 'signedOut'
  /**
   * While loading: whether a session cookie suggests the visitor is signed in. With no hint of a
   * session, public pages can render before the auth provider has loaded.
   */
  maybeSignedIn?: boolean
}

export const LOCAL_SESSION: Session = { auth: 'local', status: 'signedIn' }

export const SessionContext = createContext<Session>(LOCAL_SESSION)

export function useSession(): Session {
  return useContext(SessionContext)
}
