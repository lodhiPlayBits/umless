import { Banner, Button, EmptyState, Panel, Skeleton } from '@/shared/ui'
import type { Purchase } from '../api/billingApi'
import { formatPracticeTime } from '../model/account'
import { usePurchases } from '../model/usePurchases'

const paidOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function amount(purchase: Purchase): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: purchase.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
    purchase.amount_paise / 100,
  )
}

/** Settings → Billing: every purchase with its Razorpay payment id, the one a refund request needs. */
export default function PurchaseHistory({ title = 'Purchases' }: { title?: string | null }) {
  const purchases = usePurchases()
  return (
    // Without a visible title (its own page already has one), the region keeps its name.
    <Panel title={title ?? undefined} aria-label={title ? undefined : 'Purchases'}>
      {purchases.isPending && <Skeleton height={56} />}
      {purchases.isError && (
        <Banner
          tone="warning"
          title="Couldn't load your purchases."
          actions={
            <Button size="sm" icon="refresh" onClick={() => void purchases.refetch()}>
              Retry
            </Button>
          }
        />
      )}
      {purchases.isSuccess && purchases.data.length === 0 && (
        <EmptyState icon="receipt" title="No purchases yet">
          Packs you buy show up here with their payment id.
        </EmptyState>
      )}
      {purchases.isSuccess && purchases.data.length > 0 && (
        <ul className="ui-list billing__purchases">
          {purchases.data.map((purchase) => (
            <li key={purchase.order_id} className="ui-row">
              <span className="ui-row__text">
                <span className="ui-row__title">
                  {purchase.label} · +{formatPracticeTime(purchase.seconds)}
                </span>
                <span className="ui-row__meta">
                  {paidOn.format(new Date(purchase.paid_at))} · Payment id <code>{purchase.payment_id}</code>
                </span>
              </span>
              <strong className="ui-row__end">{amount(purchase)}</strong>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
