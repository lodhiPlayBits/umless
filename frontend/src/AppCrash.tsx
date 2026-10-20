import ErrorBanner from './components/ErrorBanner'
import Link from './Link'

const reload = () => window.location.reload()

/** The page under the header threw while rendering; the header still works. */
export function PageCrash({ showBack }: { showBack: boolean }) {
  return (
    <ErrorBanner
      title="Something went wrong on this page"
      detail="Your questions are safe on the server. Reload the page, or go back to your questions."
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={reload}>
            Reload
          </button>
          {showBack && (
            <Link to="/" className="btn">
              Back to questions
            </Link>
          )}
        </>
      }
    />
  )
}

/** The whole app threw, router included, so this uses nothing but plain markup. */
export default function AppCrash() {
  return (
    <main>
      <ErrorBanner
        title="Something went wrong"
        detail="Your questions are safe on the server. Reload the page to continue."
        actions={
          <button type="button" className="btn btn-primary" onClick={reload}>
            Reload
          </button>
        }
      />
    </main>
  )
}
