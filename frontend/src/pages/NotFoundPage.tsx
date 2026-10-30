import { PATHS } from '@/shared/config/paths'
import { useSession } from '@/shared/lib/session'
import { ButtonLink, EmptyState } from '@/shared/ui'
import './NotFoundPage.css'

/** An unknown URL (docs/design/v2/not-found.html), in the app shell or the public site. */
export default function NotFoundPage() {
  const signedIn = useSession().status === 'signedIn'
  return (
    <div className="not-found">
      <p className="not-found__code" aria-hidden="true">
        4<mark className="filler">uh</mark>4
      </p>
      <EmptyState
        bare
        headingLevel={1}
        title="That page doesn't exist"
        actions={
          signedIn ? (
            <ButtonLink to={PATHS.questions} variant="primary">
              Back to questions
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to={PATHS.landing} variant="primary">
                Home
              </ButtonLink>
              <ButtonLink to={PATHS.pricing} variant="ghost">
                Pricing
              </ButtonLink>
            </>
          )
        }
      >
        The link may be old or mistyped.
      </EmptyState>
    </div>
  )
}
