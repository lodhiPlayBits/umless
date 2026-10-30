import { SignUp } from '@clerk/react'
import { HOME_PATH, PATHS, safeRedirect } from '@/shared/config/paths'
import { useSearchParam } from '@/shared/lib/router'

/** Clerk's sign-up (themed via shared/theme/clerkAppearance); new accounts land in the app. */
export default function SignUpPage() {
  const redirect = safeRedirect(useSearchParam('redirect')) ?? HOME_PATH
  return <SignUp routing="hash" signInUrl={PATHS.signIn} forceRedirectUrl={redirect} signInForceRedirectUrl={redirect} />
}
