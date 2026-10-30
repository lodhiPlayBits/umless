import { UNREACHABLE_TITLE, classifyApiError } from '@/shared/api/apiErrors'
import { Button } from './Button'
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
'Your questions are safe. Check your connection and try again.'
        ) : error instanceof Error ? (
          error.message
        ) : (
          String(error)
        )
      }
      actions={
        <Button size="sm" icon="refresh" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  )
}
