import { apiFetch } from './client'
import type {
  DestinationProfile,
  DestinationProfileCreate,
  DestinationProfileUpdate,
  Page,
} from './types'

const BASE = '/api/v1/destination-profiles'

export function listDestinations(
  cursor?: string,
  limit = 20,
  visibility?: string[],
): Promise<Page<DestinationProfile>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  if (visibility) visibility.forEach((v) => params.append('visibility', v))
  return apiFetch<Page<DestinationProfile>>(`${BASE}?${params}`)
}

export function getDestination(id: number): Promise<DestinationProfile> {
  return apiFetch<DestinationProfile>(`${BASE}/${id}`)
}

export function createDestination(payload: DestinationProfileCreate): Promise<DestinationProfile> {
  return apiFetch<DestinationProfile>(BASE, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateDestination(
  id: number,
  payload: DestinationProfileUpdate,
): Promise<DestinationProfile> {
  return apiFetch<DestinationProfile>(`${BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteDestination(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
