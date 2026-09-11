import { apiFetch } from './client'
import type { Page, UseCase, UseCaseCreate, UseCaseUpdate } from './types'

const BASE = '/api/v1/use-cases'

export function listUseCases(
  cursor?: string,
  limit = 20,
  visibility?: string[],
): Promise<Page<UseCase>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  if (visibility) visibility.forEach((v) => params.append('visibility', v))
  return apiFetch<Page<UseCase>>(`${BASE}?${params}`)
}

export function getUseCase(id: number): Promise<UseCase> {
  return apiFetch<UseCase>(`${BASE}/${id}`)
}

export function createUseCase(payload: UseCaseCreate): Promise<UseCase> {
  return apiFetch<UseCase>(BASE, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateUseCase(id: number, payload: UseCaseUpdate): Promise<UseCase> {
  return apiFetch<UseCase>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteUseCase(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}

export function sendUseCase(
  id: number,
  destinationId: number,
): Promise<{ bytes_sent: number; destination: string; cancelled: boolean }> {
  return apiFetch(`${BASE}/${id}/send`, {
    method: 'POST',
    body: JSON.stringify({ destination_id: destinationId }),
  })
}

export function cancelUseCaseSend(id: number): Promise<void> {
  return apiFetch(`${BASE}/${id}/send/cancel`, { method: 'POST' })
}
