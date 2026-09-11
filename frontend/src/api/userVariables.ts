import { apiFetch } from './client'
import type { Page, UserVariable, UserVariableCreate, UserVariableUpdate } from './types'

const BASE = '/api/v1/variables'

export function listUserVariables(cursor?: string, limit = 200): Promise<Page<UserVariable>> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  return apiFetch<Page<UserVariable>>(`${BASE}?${params}`)
}

export function getUserVariable(id: number): Promise<UserVariable> {
  return apiFetch<UserVariable>(`${BASE}/${id}`)
}

export function createUserVariable(payload: UserVariableCreate): Promise<UserVariable> {
  return apiFetch<UserVariable>(BASE, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateUserVariable(id: number, payload: UserVariableUpdate): Promise<UserVariable> {
  return apiFetch<UserVariable>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function deleteUserVariable(id: number): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
