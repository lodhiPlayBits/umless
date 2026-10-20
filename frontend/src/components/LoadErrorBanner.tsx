import { UNREACHABLE_TITLE, classifyApiError } from '../apiErrors'
import ErrorBanner from './ErrorBanner'

interface LoadErrorBannerProps {
  error: unknown
  /** Shown when the backend answered with an error, e.g. "Couldn't load your questions". */
  title: string
  onRetry: () => void
}

/** A page's data failed to load: say whether the backend is down or answered with an error. */
export default function LoadErrorBanner({ error, title, onRetry }: LoadErrorBannerProps) {
  const unreachable = classifyApiError(error) === 'unreachable'
  return (
    <ErrorBanner
      title={unreachable ? UNREACHABLE_TITLE : title}
      detail={
        unreachable ? (
          <>
            Start the backend with <code>python run.py</code> in the <code>backend</code> folder, then retry.
          </>
        ) : error instanceof Error ? (
          error.message
        ) : (
          String(error)
        )
      }
      actions={
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Retry
        </button>
      }
    />
  )
}
