import { PATHS } from '@/shared/config/paths'
import { Banner, ButtonLink } from '@/shared/ui'
import { useAccount } from '../model/account'

/** "Free limit reached": no free and no paid time left. Nothing otherwise. */
export default function OutOfTimeBanner({ showBuy = false }: { showBuy?: boolean }) {
  const { account } = useAccount()
  if (!account?.metered || account.free_seconds_left > 0 || account.seconds_left > 0) return null
  return (
    <Banner
      tone="warning"
      title="You're out of practice time"
      actions={
        showBuy && (
          <ButtonLink to={PATHS.settingsBilling} variant="primary" size="sm">
            Buy practice time
          </ButtonLink>
        )
      }
    >
      You've used your free minutes. You can still record and download; buy time to see your next transcript.
    </Banner>
  )
}
