import { TakeScreen } from '@/features/history'
import type { PageProps } from '@/pages/types'

export default function TakePage({ params }: PageProps) {
  return <TakeScreen takeId={params.takeId} />
}
