// Single source of truth for the built-in "Library > Variables" catalog.
// Shared by LibraryVariablesPage (browsing/cloning UI) and UseCaseFormPage
// (so a placeholder like {{ _port_dynamic }} resolves automatically in the
// Log Block editor even if it was never cloned to My Variables).

export interface Param {
  name: string
  type: string
  default?: string
  description: string
}

export interface CatalogEntry {
  type: string
  label: string
  category: string
  description: string
  params: Param[]
  placeholder: string
  example: string
  fullSpec: Record<string, unknown>
  snippet: string
}

export function buildSnippet(placeholder: string, spec: Record<string, unknown>): string {
  const inner = JSON.stringify(spec, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : '  ' + line))
    .join('\n')
  return `"${placeholder}": ${inner}`
}

// The params actually transferred when cloning to My Variables - everything in
// fullSpec except type/source, which are passed as separate fields.
export function cloneParams(fullSpec: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fullSpec)) {
    if (key !== 'type' && key !== 'source') result[key] = value
  }
  return result
}

function entry(opts: Omit<CatalogEntry, 'snippet'>): CatalogEntry {
  return { ...opts, snippet: buildSnippet(opts.placeholder, opts.fullSpec) }
}

export const CATALOG: CatalogEntry[] = [
  // Time
  entry({
    type: 'timestamp',
    label: 'Timestamp (RFC 3164)',
    category: 'Time',
    placeholder: '_ts_rfc3164',
    description: 'Current date and time fixed to legacy syslog (RFC 3164) format, generated at the moment a log is sent.',
    params: [
      { name: 'format', type: 'string', default: 'rfc3164', description: 'Fixed to rfc3164 (Jun 28 14:30:00)' },
      { name: 'offset_seconds', type: 'integer', default: '0', description: 'Seconds relative to send time. Negative = past, positive = future. e.g. -7200 = 2 hours ago' },
    ],
    example: 'Jun 28 14:30:00',
    fullSpec: { type: 'timestamp', source: 'generated', format: 'rfc3164', offset_seconds: 0, default: 'Jun 27 00:00:00' },
  }),
  entry({
    type: 'timestamp',
    label: 'Timestamp (RFC 5424)',
    category: 'Time',
    placeholder: '_ts_rfc5424',
    description: 'Current date and time fixed to modern ISO 8601 (RFC 5424) format, generated at the moment a log is sent.',
    params: [
      { name: 'format', type: 'string', default: 'rfc5424', description: 'Fixed to rfc5424 (ISO 8601)' },
      { name: 'offset_seconds', type: 'integer', default: '0', description: 'Seconds relative to send time. Negative = past, positive = future. e.g. -7200 = 2 hours ago' },
    ],
    example: '2026-06-28T14:30:00.123456+00:00',
    fullSpec: { type: 'timestamp', source: 'generated', format: 'rfc5424', offset_seconds: 0, default: '2026-06-27T00:00:00Z' },
  }),

  // Network
  entry({
    type: 'ipv4',
    label: 'IPv4 Address',
    category: 'Network',
    placeholder: '_ipv4',
    description: 'Random IPv4 address. Optionally constrained to a subnet (CIDR) or a start-end range.',
    params: [
      { name: 'cidr', type: 'string', description: 'Optional subnet, e.g. 192.168.1.0/24' },
      { name: 'range', type: 'string', description: 'Optional range, e.g. 10.0.0.1-10.0.0.254' },
    ],
    example: '192.168.47.13',
    fullSpec: { type: 'ipv4', source: 'generated', cidr: '192.168.0.0/16', default: '192.168.1.100' },
  }),
  entry({
    type: 'ipv6',
    label: 'IPv6 Address',
    category: 'Network',
    placeholder: '_ipv6',
    description: 'Random fully-formed IPv6 address. Not constrained to a subnet or range.',
    params: [],
    example: '4399:ed8e:18db:651d:71ea:ddbe:c95d:eb8c',
    fullSpec: { type: 'ipv6', source: 'generated', default: '2001:db8::1' },
  }),
  entry({
    type: 'ipv4',
    label: 'Source IPv4',
    category: 'Network',
    placeholder: '_src_ipv4',
    description: 'Random IPv4 address for the source/origin side of a connection - a separate placeholder from Destination IPv4 so both can appear independently in the same Log Block (e.g. firewall or connection logs).',
    params: [
      { name: 'cidr', type: 'string', description: 'Optional subnet, e.g. 192.168.1.0/24' },
      { name: 'range', type: 'string', description: 'Optional range, e.g. 10.0.0.1-10.0.0.254' },
    ],
    example: '192.168.47.13',
    fullSpec: { type: 'ipv4', source: 'generated', cidr: '192.168.0.0/16', default: '192.168.1.100' },
  }),
  entry({
    type: 'ipv4',
    label: 'Destination IPv4',
    category: 'Network',
    placeholder: '_dst_ipv4',
    description: 'Random IPv4 address for the destination/target side of a connection - a separate placeholder from Source IPv4 so both can appear independently in the same Log Block (e.g. firewall or connection logs).',
    params: [
      { name: 'cidr', type: 'string', description: 'Optional subnet, e.g. 192.168.1.0/24' },
      { name: 'range', type: 'string', description: 'Optional range, e.g. 10.0.0.1-10.0.0.254' },
    ],
    example: '203.0.113.42',
    fullSpec: { type: 'ipv4', source: 'generated', cidr: '10.0.0.0/8', default: '10.0.0.100' },
  }),
  entry({
    type: 'ipv6',
    label: 'Source IPv6',
    category: 'Network',
    placeholder: '_src_ipv6',
    description: 'Random IPv6 address for the source/origin side of a connection - a separate placeholder from Destination IPv6 so both can appear independently in the same Log Block.',
    params: [],
    example: '2001:db8::a1b2:c3d4:e5f6:7890',
    fullSpec: { type: 'ipv6', source: 'generated', default: '2001:db8::1' },
  }),
  entry({
    type: 'ipv6',
    label: 'Destination IPv6',
    category: 'Network',
    placeholder: '_dst_ipv6',
    description: 'Random IPv6 address for the destination/target side of a connection - a separate placeholder from Source IPv6 so both can appear independently in the same Log Block.',
    params: [],
    example: '2001:db8:1::f00d:cafe',
    fullSpec: { type: 'ipv6', source: 'generated', default: '2001:db8:1::1' },
  }),
  entry({
    type: 'port',
    label: 'Port Number',
    category: 'Network',
    placeholder: '_port',
    description: 'Random TCP/UDP port number. Defaults to the ephemeral range 1024-65535. Optionally constrained to a narrower range. For the standard IANA ranges, prefer Random Low/Registered/Dynamic Port below.',
    params: [
      { name: 'min', type: 'integer', default: '1024', description: 'Minimum port (inclusive)' },
      { name: 'max', type: 'integer', default: '65535', description: 'Maximum port (inclusive)' },
    ],
    example: '38291',
    fullSpec: { type: 'port', source: 'generated', default: 8080 },
  }),
  entry({
    type: 'integer',
    label: 'Random Low Port',
    category: 'Network',
    placeholder: '_port_low',
    description: 'Random port from the IANA well-known/system port range (0-1023), used by privileged system services such as HTTP (80), HTTPS (443), or SSH (22).',
    params: [
      { name: 'min', type: 'integer', default: '0', description: 'Minimum port (inclusive)' },
      { name: 'max', type: 'integer', default: '1023', description: 'Maximum port (inclusive)' },
    ],
    example: '80',
    fullSpec: { type: 'integer', source: 'generated', min: 0, max: 1023, default: 80 },
  }),
  entry({
    type: 'integer',
    label: 'Random Registered Port',
    category: 'Network',
    placeholder: '_port_registered',
    description: 'Random port from the IANA registered port range (1024-49151), commonly used by user-installed applications and services.',
    params: [
      { name: 'min', type: 'integer', default: '1024', description: 'Minimum port (inclusive)' },
      { name: 'max', type: 'integer', default: '49151', description: 'Maximum port (inclusive)' },
    ],
    example: '8080',
    fullSpec: { type: 'integer', source: 'generated', min: 1024, max: 49151, default: 8080 },
  }),
  entry({
    type: 'integer',
    label: 'Random Dynamic Port',
    category: 'Network',
    placeholder: '_port_dynamic',
    description: 'Random port from the IANA dynamic/private/ephemeral port range (49152-65535), typically used for client-side ephemeral connections.',
    params: [
      { name: 'min', type: 'integer', default: '49152', description: 'Minimum port (inclusive)' },
      { name: 'max', type: 'integer', default: '65535', description: 'Maximum port (inclusive)' },
    ],
    example: '55000',
    fullSpec: { type: 'integer', source: 'generated', min: 49152, max: 65535, default: 55000 },
  }),
  entry({
    type: 'mac_address',
    label: 'MAC Address',
    category: 'Network',
    placeholder: '_mac',
    description: 'Random locally administered unicast MAC address in colon-separated lowercase hex notation.',
    params: [],
    example: '3a:f2:c1:d0:8b:3e',
    fullSpec: { type: 'mac_address', source: 'generated', default: '02:00:00:00:00:00' },
  }),
  entry({
    type: 'hostname',
    label: 'Hostname',
    category: 'Network',
    placeholder: '_host',
    description: 'Random realistic-looking internal hostname built from a common prefix and a two-digit number.',
    params: [],
    example: 'ws-07',
    fullSpec: { type: 'hostname', source: 'generated', default: 'ws-01' },
  }),

  // Identity
  entry({
    type: 'username',
    label: 'Username',
    category: 'Identity',
    placeholder: '_user',
    description: 'Random realistic username in first-initial + surname format, commonly used in Active Directory environments.',
    params: [],
    example: 'jsmith',
    fullSpec: { type: 'username', source: 'generated', default: 'jsmith' },
  }),

  // Unique IDs
  entry({
    type: 'uuid',
    label: 'UUID v4',
    category: 'Unique IDs',
    placeholder: '_uuid',
    description: 'Random UUID version 4. Useful for event IDs, session identifiers, and transaction references.',
    params: [],
    example: 'a3f2c1d0-8b3e-4f2a-9c1d-7e6f5a4b3c2d',
    fullSpec: { type: 'uuid', source: 'generated', default: '00000000-0000-4000-8000-000000000000' },
  }),

  // Numeric
  entry({
    type: 'integer',
    label: 'Random Integer',
    category: 'Numeric',
    placeholder: '_num',
    description: 'Random integer within a configurable range. Useful for process IDs, event sequence numbers, byte counts, and similar numeric fields.',
    params: [
      { name: 'min', type: 'integer', default: '1000', description: 'Minimum value (inclusive)' },
      { name: 'max', type: 'integer', default: '9999', description: 'Maximum value (inclusive)' },
    ],
    example: '4821',
    fullSpec: { type: 'integer', source: 'generated', min: 1000, max: 65535, default: 5000 },
  }),
  entry({
    type: 'integer',
    label: 'Process ID',
    category: 'Numeric',
    placeholder: '_pid',
    description: 'Random process ID (PID), typically used in syslog and application logs to identify the emitting process.',
    params: [
      { name: 'min', type: 'integer', default: '1024', description: 'Minimum value (inclusive)' },
      { name: 'max', type: 'integer', default: '32768', description: 'Maximum value (inclusive)' },
    ],
    example: '17342',
    fullSpec: { type: 'integer', source: 'generated', min: 1024, max: 32768, default: 1234 },
  }),

  // Cryptographic
  entry({
    type: 'hash',
    label: 'Hash Value',
    category: 'Cryptographic',
    placeholder: '_hash',
    description: 'Random hex string matching the length of a real cryptographic hash. Useful for file hashes, process hashes, and certificate thumbprints in security log templates.',
    params: [
      { name: 'algorithm', type: 'string', default: 'sha256', description: 'md5 (32 chars), sha1 (40 chars), or sha256 (64 chars)' },
    ],
    example: '5d41402abc4b2a76b9719d911017c5929b523d2a81ab4a7f718228dbc2041cb8',
    fullSpec: { type: 'hash', source: 'generated', algorithm: 'sha256', default: '5d41402abc4b2a76b9719d911017c5929b523d2a81ab4a7f718228dbc2041cb8' },
  }),
]

export const BUILTIN_VARIABLES_BY_PLACEHOLDER: Map<string, CatalogEntry> =
  new Map(CATALOG.map((e) => [e.placeholder, e]))
