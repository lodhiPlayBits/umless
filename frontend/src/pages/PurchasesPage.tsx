import { PurchaseHistory } from '@/features/billing'
import { PATHS } from '@/shared/config/paths'
import { Link } from '@/shared/ui'
import './PurchasesPage.css'

/** Every pack bought, with its Razorpay payment id (what a refund request needs). */
export default function PurchasesPage() {
  return (
    <div className="purchases-page">
      <div className="purchases-page__head">
        <h1>Purchases</h1>
        <p className="muted">
          Packs you've bought, newest first. To buy more, go to <Link to={PATHS.settingsBilling}>Billing</Link>.
        </p>
      </div>
      <PurchaseHistory title={null} />
    </div>
  )
}
