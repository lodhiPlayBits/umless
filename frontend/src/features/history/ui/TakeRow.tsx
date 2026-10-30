import { HIGH_FILLERS_PER_MINUTE, fillersPerMinute } from '@/features/progress'
import type { TakeSummary } from '@/features/takes'
import { takePath } from '@/shared/config/paths'
import { Badge, LinkRow } from '@/shared/ui'

type TakeRowProps = {
  take: TakeSummary
  title: string
  meta: string
  best?: boolean
}

/** One take in a list: opens the take; the badge is its fillers per minute (green when best, amber when high). */
export default function TakeRow({ take, title, meta, best = false }: TakeRowProps) {
  const rate = fillersPerMinute(take)
  const badge =
    rate === null ? null : (
      <Badge tone={best ? 'success' : rate >= HIGH_FILLERS_PER_MINUTE ? 'warning' : 'neutral'}>
        {rate.toFixed(1)} / min{best ? ' · best' : ''}
      </Badge>
    )
  return <LinkRow to={takePath(take.id)} title={title} meta={meta} end={badge} />
}
