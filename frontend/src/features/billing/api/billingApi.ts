import { client, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/generated/openapi'

export type Account = components['schemas']['Account']
export type Pack = components['schemas']['Pack']
export type PackId = Pack['id']
export type PaymentOrder = components['schemas']['PaymentOrder']
export type PaymentVerify = components['schemas']['PaymentVerify']

/** docs/api/openapi.yaml getAccount, createPaymentOrder, verifyPayment. */
export function getAccount(signal?: AbortSignal): Promise<Account> {
  return unwrap(client.GET('/api/account', { signal }))
}

export function createOrder(packId: PackId): Promise<PaymentOrder> {
  return unwrap(client.POST('/api/payments/orders', { body: { pack_id: packId } }))
}

export function verifyPayment(payment: PaymentVerify): Promise<Account> {
  return unwrap(client.POST('/api/payments/verify', { body: payment }))
}
