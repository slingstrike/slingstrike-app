// Shared between MyVariableFormPage (full edit page) and CreateVariableModal
// (quick-create modal) so both stay in sync - single source of truth for
// what a "My Variable" type is and how it previews/defaults.

export const VARIABLE_TYPES = [
  { value: 'timestamp',   label: 'Timestamp',      category: 'Time' },
  { value: 'ipv4',        label: 'IPv4 Address',   category: 'Network' },
  { value: 'ipv6',        label: 'IPv6 Address',   category: 'Network' },
  { value: 'port',        label: 'Port Number',    category: 'Network' },
  { value: 'mac_address', label: 'MAC Address',    category: 'Network' },
  { value: 'hostname',    label: 'Hostname',       category: 'Network' },
  { value: 'username',    label: 'Username',       category: 'Identity' },
  { value: 'uuid',        label: 'UUID v4',        category: 'Unique IDs' },
  { value: 'integer',     label: 'Random Integer', category: 'Numeric' },
  { value: 'hash',        label: 'Hash Value',     category: 'Cryptographic' },
]

export const TYPE_DEFAULT_CATEGORY: Record<string, string> = Object.fromEntries(
  VARIABLE_TYPES.map((t) => [t.value, t.category])
)

export const SUGGESTED_VARIABLE_CATEGORIES = Array.from(
  new Set(VARIABLE_TYPES.map((t) => t.category))
).sort()

export const DEFAULT_PARAMS: Record<string, Record<string, unknown>> = {
  timestamp:   { format: 'rfc5424', offset_seconds: 0 },
  ipv4:        {},
  ipv6:        {},
  port:        { min: 1024, max: 65535 },
  mac_address: {},
  hostname:    {},
  username:    {},
  uuid:        {},
  integer:     { min: 1000, max: 9999 },
  hash:        { algorithm: 'sha256' },
}

export function slugifyVar(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'var'
  return `_${slug}`
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export function generatePreview(type: string, params: Record<string, unknown>): string {
  switch (type) {
    case 'timestamp': {
      const offset = Number(params.offset_seconds ?? 0)
      return new Date(Date.now() + offset * 1000).toISOString()
    }
    case 'ipv4':
      return `${rand(1, 254)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`
    case 'ipv6':
      return Array.from({ length: 8 }, () => rand(0, 0xffff).toString(16)).join(':')
    case 'port':
      return String(rand(Number(params.min ?? 1024), Number(params.max ?? 65535)))
    case 'mac_address':
      return Array.from({ length: 6 }, () => rand(0, 255).toString(16).padStart(2, '0')).join(':')
    case 'hostname': {
      const prefixes = ['ws', 'srv', 'dc', 'fw', 'ap', 'db', 'app']
      return `${prefixes[rand(0, prefixes.length - 1)]}-${String(rand(1, 99)).padStart(2, '0')}`
    }
    case 'username': {
      const initials = 'abcdefghjklmnoprstw'.split('')
      const surnames = ['smith', 'jones', 'brown', 'taylor', 'wilson', 'davis', 'martin', 'garcia']
      return `${initials[rand(0, initials.length - 1)]}${surnames[rand(0, surnames.length - 1)]}`
    }
    case 'uuid':
      return crypto.randomUUID()
    case 'integer':
      return String(rand(Number(params.min ?? 1000), Number(params.max ?? 9999)))
    case 'hash': {
      const algo = String(params.algorithm ?? 'sha256')
      const len = algo === 'md5' ? 32 : algo === 'sha1' ? 40 : 64
      return Array.from({ length: len }, () => rand(0, 15).toString(16)).join('')
    }
    default:
      return ''
  }
}
