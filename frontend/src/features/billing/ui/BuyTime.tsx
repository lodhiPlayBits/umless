import ChoiceDialog from '@/shared/ui/ChoiceDialog'
import { useAccount } from '../model/account'
import { buyPack as realBuyPack } from '../model/purchase'
import { packPrice, packWasPrice, usePurchase } from '../model/usePurchase'

interface BuyTimeProps {
  /** Called once: with a message after a payment, or null if the user backed out. */
  onDone: (message: string | null) => void
  buyPack?: typeof realBuyPack
}

/** Pick a pack, then Razorpay Checkout takes over the screen until the payment is done. */
export default function BuyTime({ onDone, buyPack = realBuyPack }: BuyTimeProps) {
  const { account } = useAccount()
  const purchase = usePurchase(buyPack)

  // Checkout is on screen; don't stack a dialog under it.
  if (purchase.paying) return null
  const packs = account?.packs ?? []
  return (
    <ChoiceDialog
      title="Buy practice time"
      choices={[
        { label: 'Not now', onClick: () => onDone(null) },
        ...packs.map((pack, index) => ({
          label: `${pack.label} · ${packPrice(pack)}${packWasPrice(pack) ? ` (was ${packWasPrice(pack)})` : ''}`,
          style: index === 0 ? ('primary' as const) : undefined,
          onClick: () =>
            void purchase.buy(pack).then((outcome) => {
              if (outcome?.kind === 'paid') onDone(outcome.message)
            }),
        })),
      ]}
    >
      <p>Each transcription uses up the length of your recording. Unused time never expires.</p>
      {packs.length === 0 && <p>Loading prices…</p>}
      {purchase.outcome?.kind === 'failed' && (
        <p className="ui-dialog__error" role="alert">
          {purchase.outcome.message}
        </p>
      )}
    </ChoiceDialog>
  )
}
