import { client, unwrap } from '../client'
import type { components } from '../generated/openapi'

export type TakeSummary = components['schemas']['TakeSummary']
export type Take = components['schemas']['Take']

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
