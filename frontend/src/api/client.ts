import type { ApiError } from './types'

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    const text = await response.text()
    throw new ApiRequestError(
      'SERVER_ERROR',
      text || `HTTP ${response.status}`,
      response.status,
    )
  }

  const data: unknown = await response.json()

  if (!response.ok) {
    const err = data as ApiError
    throw new ApiRequestError(err.error.code, err.error.message, response.status)
  }

  return data as T
}
