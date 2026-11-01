import { Button } from '@/shared/ui'
import { practiceTimeLabel, useAccount } from '../model/account'
import { useBuyTime } from './useBuyTime'

/** Top-bar chip: free and paid time left; opens Buy practice time. */
export default function PracticeTime({ className }: { className?: string }) {
  const { account } = useAccount()
  const buy = useBuyTime()

  if (!account?.metered) return null
  const label = practiceTimeLabel(account)
  return (
    <>
      <Button variant="ghost" size="sm" icon="clock" className={className} aria-label={`Practice time: ${label}. Buy more`} onClick={buy.open}>
        {label}
      </Button>
      {buy.ui}
    </>
  )
}
