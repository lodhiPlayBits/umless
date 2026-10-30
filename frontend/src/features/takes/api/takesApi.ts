import { client, unwrap } from '@/shared/api/client'
import type { components } from '@/shared/api/generated/openapi'

export type TakeSummary = components['schemas']['TakeSummary']
export type Take = components['schemas']['Take']
export type Transcript = components['schemas']['Transcript']

/** Which takes to list across questions (docs/api/openapi.yaml listAllTakes). */
export type TakeFilter = { questionId?: string; since?: string; limit?: number }

/** Takes across all questions (or one question's), newest first. */
export async function listAllTakes(filter: TakeFilter = {}, signal?: AbortSignal): Promise<TakeSummary[]> {
  const body = await unwrap(client.GET('/api/takes', { params: { query: filter }, signal }))
  return body.items
}

/** A question's saved takes (docs/api/openapi.yaml listTakes, getTake, deleteTake). */
export interface TakesApi {
  /** Newest first. */
  list(questionId: string, signal?: AbortSignal): Promise<TakeSummary[]>
  get(takeId: string): Promise<Take>
  remove(takeId: string): Promise<void>
}

export const takesApi: TakesApi = {
  async list(questionId, signal) {
    const body = await unwrap(client.GET('/api/questions/{questionId}/takes', { params: { path: { questionId } }, signal }))
    return body.items
  },
  get(takeId) {
    return unwrap(client.GET('/api/takes/{takeId}', { params: { path: { takeId } } }))
  },
  async remove(takeId) {
    await unwrap(client.DELETE('/api/takes/{takeId}', { params: { path: { takeId } } }))
  },
}
