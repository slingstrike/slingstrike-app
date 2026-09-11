export type Tier = 'community' | 'premium'
export type Visibility = 'private' | 'public_readonly' | 'public_collaborative'
export type Protocol = 'udp' | 'tcp' | 'tls'

export interface LogEvent {
  sequence: number
  format: string
  template: string
  variables?: Record<string, unknown>
  delay_ms?: number
  repeat?: number
}

export interface UseCase {
  id: number
  uuid: string
  name: string
  description: string
  tier: Tier
  visibility: Visibility
  created_by: string
  log_source: { category: string | null; platform: string | null } | null
  log_events: LogEvent[]
  mitre_tactics: string[]
  mitre_techniques: string[]
  tags: string[]
  target_ids: string[]
  run_count: number
  run_delay_ms: number
  owner_id: number | null
  imported_at: string | null
  last_edited_at: string
  created_at: string
  updated_at: string
}

export interface UseCaseCreate {
  name: string
  description?: string
  visibility?: Visibility
  created_by?: string
  log_events?: LogEvent[]
  mitre_tactics?: string[]
  mitre_techniques?: string[]
  tags?: string[]
  run_count?: number
  run_delay_ms?: number
}

export interface UseCaseUpdate {
  name?: string
  description?: string
  visibility?: Visibility
  created_by?: string
  log_events?: LogEvent[]
  mitre_tactics?: string[]
  mitre_techniques?: string[]
  tags?: string[]
  run_count?: number
  run_delay_ms?: number
}

export interface DestinationProfile {
  id: number
  uuid: string | null
  name: string
  description: string
  host: string
  port: number
  protocol: Protocol
  tls_ca_cert: string | null
  visibility: string
  created_at: string
  updated_at: string
}

export interface DestinationProfileCreate {
  name: string
  description?: string
  host: string
  port: number
  protocol?: Protocol
  tls_ca_cert?: string | null
}

export interface DestinationProfileUpdate {
  name?: string
  description?: string
  host?: string
  port?: number
  protocol?: Protocol
  tls_ca_cert?: string | null
}

export interface Page<T> {
  items: T[]
  next_cursor: string | null
  total_count: number
}

export type ObjectType = 'ipv4' | 'ipv6' | 'hostname' | 'username' | 'port' | 'filepath' | 'url' | 'string'

export interface ObjectGroup {
  id: number
  name: string
  placeholder: string
  description: string
  type: ObjectType
  values: string[]
  category: string
  usage_count: number
  created_at: string
  updated_at: string
}

export interface ObjectGroupCreate {
  name: string
  description: string
  type: ObjectType
  values: string[]
  category?: string
  placeholder?: string
}

export type ObjectGroupUpdate = ObjectGroupCreate

export interface UserVariable {
  id: number
  name: string
  placeholder: string
  description: string
  type: string
  category: string
  params: Record<string, unknown>
  usage_count: number
  created_at: string
  updated_at: string
}

export interface UserVariableCreate {
  name: string
  description?: string
  type: string
  category?: string
  params?: Record<string, unknown>
}

export type UserVariableUpdate = UserVariableCreate

export interface ApiError {
  error: {
    code: string
    message: string
    details: Record<string, unknown>
  }
}
