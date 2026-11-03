import { Badge, Button } from '@/shared/ui'
import { FREE_MINUTES, OFFER_LABEL, TIME_NOTE } from '@/content/business'
import { practiceTimeLabel, useAccount } from '../model/account'
import { packWasPrice } from '../model/usePurchase'
import { useBuyTime } from './useBuyTime'
import './PracticeTimeCard.css'

/** Sidebar card: what's left to practise with, a bar for the free minutes, and Buy time. */
export default function PracticeTimeCard({ className }: { className?: string }) {
  const { account } = useAccount()
  const buy = useBuyTime()

  if (!account?.metered) return null
  const free = account.free_seconds_left
  const freeMax = Math.max(FREE_MINUTES * 60, free)
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
          aria-label="Free time left"
          aria-valuemin={0}
          aria-valuemax={freeMax}
          aria-valuenow={free}
        >
          <span style={{ width: `${(free / freeMax) * 100}%` }} />
        </div>
      )}
      {/* Only while the server really charges the offer prices. */}
      {account.packs.some((pack) => packWasPrice(pack)) && <Badge>{OFFER_LABEL}</Badge>}
      <Button size="sm" block onClick={buy.open}>
        Buy time
      </Button>
      <p className="practice-time-card__note">{TIME_NOTE}</p>
      {buy.ui}
    </div>
  )
}
