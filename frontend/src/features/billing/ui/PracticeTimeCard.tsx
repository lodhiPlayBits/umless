import { Button } from '@/shared/ui'
import { FREE_TRANSCRIPTIONS } from '@/content/business'
import { practiceTimeLabel, useAccount } from '../model/account'
import { useBuyTime } from './useBuyTime'
import './PracticeTimeCard.css'

/** Sidebar card: what's left to practise with, a bar for the free transcriptions, and Buy time. */
export default function PracticeTimeCard({ className }: { className?: string }) {
  const { account } = useAccount()
  const buy = useBuyTime()

  if (!account?.metered) return null
  const free = account.free_transcriptions_left
  const freeMax = Math.max(FREE_TRANSCRIPTIONS, free)
  const label = practiceTimeLabel(account)
  return (
    <div className={`practice-time-card ${className ?? ''}`.trim()}>
      <div className="practice-time-card__head">
        <strong>Practice time</strong>
        <span>{label}</span>
      </div>
      {free > 0 && (
        <div
          className="practice-time-card__bar"
          role="meter"
          aria-label="Free transcriptions left"
          aria-valuemin={0}
          aria-valuemax={freeMax}
          aria-valuenow={free}
        >
          <span style={{ width: `${(free / freeMax) * 100}%` }} />
        </div>
      )}
      <Button size="sm" block onClick={buy.open}>
        Buy time
      </Button>
      {buy.ui}
    </div>
  )
}
