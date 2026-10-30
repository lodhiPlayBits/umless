import { useQuestions } from '@/features/questions'
import { sinceDaysAgo } from '@/features/progress'
import { useAllTakes } from '@/features/takes'
import { Skeleton } from '@/shared/ui'
import LoadErrorBanner from '@/shared/ui/LoadErrorBanner'
import FirstVisit from './FirstVisit'
import Returning from './Returning'
import './dashboard.css'

/** Eight weeks of takes: enough for this week, last week and the trend chart. */
const TREND_DAYS = 56

/**
 * The signed-in home (docs/design/v2/app-dashboard.html): a getting-started checklist until the
 * first take, then this week's numbers, the trend and what to practise next.
 */
export default function DashboardScreen({ now = new Date() }: { now?: Date }) {
  const questions = useQuestions()
  const recent = useAllTakes({ since: sinceDaysAgo(TREND_DAYS, now), limit: 1000 })
  const anyTake = useAllTakes({ limit: 1 })

  const failed = [questions, recent, anyTake].find((query) => query.isError)
  if (failed) {
    return (
      <LoadErrorBanner
        error={failed.error}
        title="Couldn't load your dashboard"
        onRetry={() => [questions, recent, anyTake].forEach((query) => void query.refetch())}
      />
    )
  }
  if (!questions.isSuccess || !recent.isSuccess || !anyTake.isSuccess) {
    return (
      <div className="dashboard" aria-busy="true" aria-label="Loading your dashboard">
        <Skeleton width="40%" height={32} />
        <Skeleton height={96} />
        <div className="dashboard__stats">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} height={110} />
          ))}
        </div>
      </div>
    )
  }
  if (anyTake.data.length === 0) return <FirstVisit questions={questions.data} />
  return <Returning questions={questions.data} takes={recent.data} now={now} />
}
