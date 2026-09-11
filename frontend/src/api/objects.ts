import { apiFetch } from './client'
import type { ObjectGroup, ObjectGroupCreate, ObjectGroupUpdate, Page } from './types'

const BASE = '/api/v1/objects'

export function listObjects(cursor?: string, limit = 20): Promise<Page<ObjectGroup>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return apiFetch<Page<ObjectGroup>>(`${BASE}?${params}`)
}

export function getObject(id: number): Promise<ObjectGroup> {
  return apiFetch<ObjectGroup>(`${BASE}/${id}`)
}

export function createObject(payload: ObjectGroupCreate): Promise<ObjectGroup> {
  return apiFetch<ObjectGroup>(BASE, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateObject(id: number, payload: ObjectGroupUpdate): Promise<ObjectGroup> {
  return apiFetch<ObjectGroup>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteObject(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
