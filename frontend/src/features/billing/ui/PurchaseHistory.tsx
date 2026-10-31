import { useState } from 'react'
import { Badge, Banner, Button, EmptyState, Panel, Skeleton } from '@/shared/ui'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import type { Purchase } from '../api/billingApi'
import { formatPracticeTime } from '../model/account'
import { usePurchases } from '../model/usePurchases'
import { useRefund } from '../model/useRefund'

const paidOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function amount(purchase: Purchase): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: purchase.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
    purchase.amount_paise / 100,
  )
}

/** Settings → Billing: every purchase with its Razorpay payment id, and a refund for unused packs. */
export default function PurchaseHistory({ title = 'Purchases', refund: useRefundHook = useRefund }: { title?: string | null; refund?: typeof useRefund }) {
  const purchases = usePurchases()
  const { refund, pendingId, outcome, clearOutcome } = useRefundHook()
  const [confirming, setConfirming] = useState<Purchase | null>(null)

  return (
    // Without a visible title (its own page already has one), the region keeps its name.
    <Panel title={title ?? undefined} aria-label={title ? undefined : 'Purchases'}>
      {outcome && (
        <Banner
          tone={outcome.kind === 'requested' ? 'success' : 'warning'}
          title={outcome.kind === 'requested' ? 'Refund requested.' : "The refund couldn't be requested"}
          actions={
            <Button size="sm" variant="ghost" onClick={clearOutcome}>
              Dismiss
            </Button>
          }
        >
          {outcome.message}
        </Banner>
      )}
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
                  {purchase.status === 'refund_pending' && <Badge tone="warning">Refund in progress</Badge>}
                  {purchase.status === 'refunded' && <Badge>Refunded</Badge>}
                </span>
                <span className="ui-row__meta">
                  {paidOn.format(new Date(purchase.paid_at))} · Payment id <code>{purchase.payment_id}</code>
                </span>
              </span>
              <span className="ui-row__end billing__purchase-end">
                <strong>{amount(purchase)}</strong>
                {purchase.refundable && (
                  <Button size="sm" disabled={pendingId !== null} onClick={() => setConfirming(purchase)}>
                    {pendingId === purchase.order_id ? 'Requesting…' : 'Request refund'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Refund ${amount(confirming)}?`}
          confirmLabel="Refund"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const purchase = confirming
            setConfirming(null)
            void refund(purchase)
          }}
        >
          <p>
            {formatPracticeTime(confirming.seconds)} will be removed from your practice time now. Razorpay returns {amount(confirming)} to your original
            payment method in 5–7 working days.
          </p>
        </ConfirmDialog>
      )}
    </Panel>
  )
}
