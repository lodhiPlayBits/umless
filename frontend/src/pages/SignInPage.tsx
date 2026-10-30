import { SignIn } from '@clerk/react'
import { HOME_PATH, PATHS, safeRedirect } from '@/shared/config/paths'
import { useSearchParam } from '@/shared/lib/router'

/** Clerk's sign-in (themed via shared/theme/clerkAppearance), returning to ?redirect= afterwards. */
export default function SignInPage() {
  const redirect = safeRedirect(useSearchParam('redirect')) ?? HOME_PATH
  // Hash routing keeps Clerk's inner steps (#/factor-one…) out of our router's paths.
  return <SignIn routing="hash" signUpUrl={PATHS.signUp} forceRedirectUrl={redirect} signUpForceRedirectUrl={redirect} />
}
