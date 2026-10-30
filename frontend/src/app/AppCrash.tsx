import { PATHS } from '@/shared/config/paths'
import ErrorBanner from '@/shared/ui/ErrorBanner'
import { Button, ButtonLink } from '@/shared/ui'

const reload = () => window.location.reload()

/** The page under the header threw while rendering; the header still works. */
export function PageCrash({ showBack }: { showBack: boolean }) {
  return (
    <ErrorBanner
      title="Something went wrong on this page"
      detail="Your questions are safe on the server. Reload the page, or go back to your questions."
      actions={
        <>
          <Button variant="primary" size="sm" icon="refresh" onClick={reload}>
            Reload
          </Button>
          {showBack && (
            <ButtonLink to={PATHS.questions} variant="ghost" size="sm">
              Back to questions
            </ButtonLink>
          )}
        </>
      }
    />
  )
}

/** The whole app threw, router included, so this uses nothing but plain markup. */
export default function AppCrash() {
  return (
    <main className="app-crash">
      <ErrorBanner
        title="Something went wrong"
        detail="Your questions are safe on the server. Reload the page to continue."
        actions={
          <Button variant="primary" size="sm" icon="refresh" onClick={reload}>
            Reload
          </Button>
        }
      />
    </main>
  )
}
