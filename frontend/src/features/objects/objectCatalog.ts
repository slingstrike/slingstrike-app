// Shared between MyObjectFormPage (full edit page) and CreateObjectModal
// (quick-create modal) so both stay in sync - single source of truth for
// what a "My Object" type is and how it hints/defaults.

import type { ObjectType } from '../../api/types'

export const OBJECT_TYPES: { value: ObjectType; label: string }[] = [
  { value: 'ipv4',      label: 'IPv4 Addresses' },
  { value: 'ipv6',      label: 'IPv6 Addresses' },
  { value: 'hostname',  label: 'Hostnames' },
  { value: 'username',  label: 'Usernames' },
  { value: 'port',      label: 'Port Numbers' },
  { value: 'filepath',  label: 'File Paths' },
  { value: 'url',       label: 'URLs' },
  { value: 'string',    label: 'Strings (generic)' },
]

export const TYPE_HINTS: Record<ObjectType, string> = {
  ipv4:      'One IPv4 address per line, e.g. 192.168.1.10',
  ipv6:      'One IPv6 address per line, e.g. 2001:db8::1',
  hostname:  'One hostname or FQDN per line, e.g. dc01.corp.local',
  username:  'One username per line, e.g. jsmith',
  port:      'One port number per line, e.g. 443',
  filepath:  'One file path per line, e.g. C:\\Windows\\System32\\cmd.exe',
  url:       'One URL per line, e.g. https://example.com/payload',
  string:    'One value per line',
}

export const KNOWN_CATEGORIES = ['Endpoint', 'Identity', 'Network', 'File System', 'Web', 'Windows', 'Cloud']

export function slugifyObj(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'object'
}
