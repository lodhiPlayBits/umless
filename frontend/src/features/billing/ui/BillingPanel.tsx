import { useState } from 'react'
import { FREE_MINUTES, LEGAL_PAGES } from '@/content/business'
import { Badge, Banner, Button, EmptyState, Link, Panel, Skeleton, Stat, cx } from '@/shared/ui'
import type { Pack } from '../api/billingApi'
import { formatPracticeTime, practiceTimeLabel, useAccount } from '../model/account'
import { buyPack as realBuyPack } from '../model/purchase'
import { packPrice, usePurchase } from '../model/usePurchase'
import OutOfTimeBanner from './OutOfTimeBanner'
import { PATHS } from '@/shared/config/paths'
import './billing.css'

/** The pack with the lowest price per minute: the one to recommend. */
function bestValue(packs: readonly Pack[]): Pack | undefined {
  return [...packs].sort((a, b) => a.amount_paise / a.seconds - b.amount_paise / b.seconds)[0]
}

/**
 * Settings → Billing (docs/design/v2/app-settings.html "Billing"): what's left, the packs, and
 * what happened to the last payment. Packs, not plans: buying time never subscribes you to anything.
 */
export default function BillingPanel({ buyPack = realBuyPack }: { buyPack?: typeof realBuyPack }) {
  const { status, account } = useAccount()
  const purchase = usePurchase(buyPack)
  const [lastPack, setLastPack] = useState<Pack | null>(null)

  if (status === 'loading') return <Skeleton height={160} />
  if (!account) return <Banner tone="danger" title="Couldn't load your practice time." />
  if (!account.metered) {
    return (
      <EmptyState icon="clock" title="Practice time isn't counted here">
        This server has no payments set up, so transcriptions are unlimited.
      </EmptyState>
    )
  }

  const best = bestValue(account.packs)
  const refunds = LEGAL_PAGES.find((page) => page.id === 'refunds')!
  const buy = (pack: Pack) => {
    setLastPack(pack)
    void purchase.buy(pack)
  }

  return (
    <div className="billing">
      {purchase.outcome?.kind === 'paid' && (
        <Banner tone="success" title="Payment worked.">
          {purchase.outcome.message} You now have {formatPracticeTime(account.seconds_left)} of paid practice time.
        </Banner>
      )}
      {purchase.outcome?.kind === 'failed' && (
        <Banner
          tone="danger"
          title="The payment didn't go through"
          actions={
            lastPack && (
              <Button size="sm" icon="refresh" onClick={() => buy(lastPack)}>
                Try again
              </Button>
            )
          }
        >
          {purchase.outcome.message}
        </Banner>
      )}
      {!purchase.outcome && <OutOfTimeBanner />}

      <Panel title="Practice time" actions={<Badge tone="primary">{practiceTimeLabel(account)}</Badge>}>
        <div className="billing__balance">
          <Stat
            label="Free practice time"
            value={account.free_seconds_left > 0 ? formatPracticeTime(account.free_seconds_left) : 'Used up'}
            note={`of ${formatPracticeTime(FREE_MINUTES * 60)}`}
          />
          <Stat
            label="Paid practice time"
            value={account.seconds_left > 0 ? formatPracticeTime(account.seconds_left) : 'None'}
            note="Never expires"
          />
        </div>
        <p className="muted">
          Each transcription uses exactly the length of the recording, by the second: free minutes first, then paid time.
          A recording under 15 seconds with no words isn't charged. One recording can be up to 10 minutes.
        </p>
      </Panel>

      <Panel title="Buy practice time">
        <ul className="billing__packs">
          {account.packs.map((pack) => (
            <li key={pack.id} className={cx('billing__pack', pack === best && 'billing__pack--best')}>
              {pack === best && <Badge className="billing__ribbon">Best value</Badge>}
              <strong className="billing__pack-name">{pack.label}</strong>
              <span className="billing__price">{packPrice(pack)}</span>
              <span className="muted">
                {formatPracticeTime(pack.seconds)} of recording time · ₹{(pack.amount_paise / 100 / (pack.seconds / 60)).toFixed(2)} / min
              </span>
              <Button variant={pack === best ? 'primary' : 'secondary'} block disabled={purchase.paying} onClick={() => buy(pack)}>
                Buy {pack.label}
              </Button>
            </li>
          ))}
        </ul>
        <p className="muted billing__note">
          Pay with UPI, cards, net banking or wallets through Razorpay. One-off payments, no subscription. A pack can be refunded
          within 3 days if none of its time has been used: see the <Link to={`/${refunds.id}`}>{refunds.title}</Link>.
        </p>
      </Panel>

      <p className="billing__note">
        <Link to={PATHS.purchases}>See all your purchases and their payment ids →</Link>
      </p>
    </div>
  )
}
