import { useQuery } from '@tanstack/react-query'
import { queryClient, withTimeout } from '@/shared/api/query'
import { listPurchases } from '../api/billingApi'

export const PURCHASES_KEY = ['purchases'] as const

/** What the user has bought, newest first (Settings → Billing). */
export function usePurchases() {
  return useQuery({ queryKey: PURCHASES_KEY, queryFn: ({ signal }) => listPurchases(withTimeout(signal)) }, queryClient)
}

/** A payment went through: the list reloads wherever it's shown. */
export function invalidatePurchases() {
  return queryClient.invalidateQueries({ queryKey: PURCHASES_KEY })
}
