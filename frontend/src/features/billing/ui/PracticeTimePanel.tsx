import { PRICING } from '@/content/business'
import { Button, Panel } from '@/shared/ui'
import { practiceTimeLabel, useAccount } from '../model/account'
import { useBuyTime } from './useBuyTime'

/** Settings: what's left to practise with, and Buy time. Nothing on a server without payments. */
export default function PracticeTimePanel() {
  const { account } = useAccount()
  const buy = useBuyTime()

  if (!account?.metered) return null
  return (
    <Panel title="Practice time" actions={<strong>{practiceTimeLabel(account)}</strong>}>
      <p className="muted">
        {PRICING.free}. After that, buy practice time; it never expires. {PRICING.packs.map((pack) => `${pack.time} for ${pack.price}`).join(', ')}.
      </p>
      <div>
        <Button variant="primary" icon="plus" onClick={buy.open}>
          Buy time
        </Button>
      </div>
      {buy.ui}
    </Panel>
  )
}
