import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Braces, HelpCircle, Package, Play, CheckCircle, Plus, Square, X } from 'lucide-react'
import { createUseCase, getUseCase, updateUseCase, sendUseCase, cancelUseCaseSend } from '../api/useCases'
import { listDestinations } from '../api/destinations'
import { listObjects } from '../api/objects'
import { listUserVariables } from '../api/userVariables'
import type { DestinationProfile, LogEvent, ObjectGroup, UserVariable } from '../api/types'
import TemplateEditor, { type CompletionItem } from '../features/editor/TemplateEditor'
import { CATALOG, BUILTIN_VARIABLES_BY_PLACEHOLDER } from '../features/editor/builtinVariables'
import CreateVariableModal from '../features/variables/CreateVariableModal'
import CreateObjectModal from '../features/objects/CreateObjectModal'

// ── Random helpers ───────────────────────────────────────────────────────────

const _RAND_USERS = ['jsmith', 'adoe', 'bjohnson', 'kwilliams', 'mthompson', 'rbrown', 'ldavis', 'sharris', 'mwilson', 'cnguyen']
const _RAND_HOSTS = ['ws', 'srv', 'dc', 'fw', 'app', 'db', 'win', 'lin']
const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randHex(len: number) { return [...Array(len)].map(() => randInt(0, 15).toString(16)).join('') }
function randPick<T>(arr: readonly T[]): T { return arr[randInt(0, arr.length - 1)] }
function randIPv6(): string { return [...Array(8)].map(() => randHex(4)).join(':') }

// ── Variable builder ────────────────────────────────────────────────────────

type VarMode =
  | 'static'
  | 'ipv4_random'
  | 'ipv4_cidr'
  | 'ipv4_range'
  | 'ipv6_random'
  | 'integer'
  | 'timestamp'
  | 'uuid'
  | 'port'
  | 'mac_address'
  | 'hostname'
  | 'username'
  | 'hash'
  | 'group'

interface VariableConfig {
  mode: VarMode
  value?: string
  cidr?: string
  range?: string
  min?: string
  max?: string
  group?: string
  ts_format?: string
  ts_offset?: string
  ts_offset_custom?: string
  hash_algorithm?: string
}

const OFFSET_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: 'Now',              seconds: 0 },
  { label: '5 minutes ago',    seconds: -300 },
  { label: '15 minutes ago',   seconds: -900 },
  { label: '30 minutes ago',   seconds: -1800 },
  { label: '1 hour ago',       seconds: -3600 },
  { label: '2 hours ago',      seconds: -7200 },
  { label: '6 hours ago',      seconds: -21600 },
  { label: '12 hours ago',     seconds: -43200 },
  { label: '24 hours ago',     seconds: -86400 },
  { label: '30 minutes later', seconds: 1800 },
  { label: '1 hour later',     seconds: 3600 },
  { label: 'Custom (seconds)', seconds: null },
]

function getGeneratedPreviewValue(cfg: VariableConfig): string {
  switch (cfg.mode) {
    case 'timestamp': {
      const offsetSec = cfg.ts_offset === 'Custom (seconds)'
        ? Number(cfg.ts_offset_custom ?? '0')
        : (OFFSET_OPTIONS.find((o) => o.label === cfg.ts_offset)?.seconds ?? 0)
      const d = new Date(Date.now() + offsetSec * 1000)
      if ((cfg.ts_format ?? 'rfc5424') === 'rfc3164') {
        const day = String(d.getDate()).padStart(2, ' ')
        const h = String(d.getHours()).padStart(2, '0')
        const m = String(d.getMinutes()).padStart(2, '0')
        const s = String(d.getSeconds()).padStart(2, '0')
        return `${_MONTHS[d.getMonth()]} ${day} ${h}:${m}:${s}`
      }
      return d.toISOString()
    }
    case 'uuid':
      return `${randHex(8)}-${randHex(4)}-4${randHex(3)}-${(8 + randInt(0, 3)).toString(16)}${randHex(3)}-${randHex(12)}`
    case 'port':        return String(randInt(1024, 65535))
    case 'mac_address': return [...Array(6)].map(() => randHex(2)).join(':')
    case 'hostname':    return `${randPick(_RAND_HOSTS)}-${String(randInt(1, 99)).padStart(2, '0')}`
    case 'username':    return randPick(_RAND_USERS)
    case 'ipv4_random': return `${randInt(1,254)}.${randInt(0,255)}.${randInt(0,255)}.${randInt(1,254)}`
    case 'ipv6_random':  return randIPv6()
    case 'ipv4_cidr': {
      const [base, prefixStr] = (cfg.cidr ?? '192.168.1.0/24').split('/')
      const octets = (base ?? '192.168.1.0').split('.').map(Number)
      const hostBits = 32 - parseInt(prefixStr ?? '24')
      if (hostBits > 0) {
        const maxHost = Math.pow(2, Math.min(hostBits, 8)) - 2
        octets[3] = randInt(1, Math.max(maxHost, 1))
      }
      return octets.join('.')
    }
    case 'ipv4_range': {
      const parts = (cfg.range ?? '10.0.0.1-10.0.0.50').split('-')
      const startOctets = (parts[0] ?? '10.0.0.1').split('.').map(Number)
      const endOctets = (parts[1] ?? '10.0.0.50').split('.').map(Number)
      const result = [...startOctets]
      result[3] = randInt(startOctets[3] ?? 1, endOctets[3] ?? 50)
      return result.join('.')
    }
    case 'integer': return String(randInt(Number(cfg.min ?? 1), Number(cfg.max ?? 9999)))
    case 'hash': {
      const len = cfg.hash_algorithm === 'md5' ? 32 : cfg.hash_algorithm === 'sha1' ? 40 : 64
      return randHex(len)
    }
    case 'static': return cfg.value ?? ''
    case 'group':  return cfg.group ? `[${cfg.group}]` : ''
  }
}

function getObjectPreviewValue(obj: ObjectGroup): string {
  return (obj.values ?? [])[0] ?? ''
}

function specToConfig(spec: Record<string, unknown>): VariableConfig {
  // "ip" is the canonical .olf spec type for an IPv4 address (backend/schemas/olf.py);
  // "ipv4" is this editor's internal/catalog spelling. Normalize so a variable
  // round-tripped through a .olf import (which always stores "ip") is recognized
  // the same as one authored directly in this editor (which stores "ipv4").
  const rawType = String(spec.type ?? 'string')
  const type = rawType === 'ip' ? 'ipv4' : rawType
  const source = String(spec.source ?? '')
  if (source === 'generated') {
    if (type === 'ipv4') {
      if (spec.cidr) return { mode: 'ipv4_cidr', cidr: String(spec.cidr) }
      if (spec.range) return { mode: 'ipv4_range', range: String(spec.range) }
      return { mode: 'ipv4_random' }
    }
    if (type === 'ipv6') return { mode: 'ipv6_random' }
    if (type === 'integer')
      return { mode: 'integer', min: String(spec.min ?? '1'), max: String(spec.max ?? '9999') }
    if (type === 'timestamp') {
      const fmt = String(spec.format ?? 'rfc5424')
      const offsetSec = spec.offset_seconds !== undefined ? Number(spec.offset_seconds) : 0
      const match = OFFSET_OPTIONS.find((o) => o.seconds === offsetSec)
      return {
        mode: 'timestamp',
        ts_format: fmt,
        ts_offset: match ? match.label : 'Custom (seconds)',
        ts_offset_custom: match ? undefined : String(offsetSec),
      }
    }
    if (type === 'uuid') return { mode: 'uuid' }
    if (type === 'port') return { mode: 'port' }
    if (type === 'mac_address') return { mode: 'mac_address' }
    if (type === 'hostname') return { mode: 'hostname' }
    if (type === 'username') return { mode: 'username' }
    if (type === 'hash') return { mode: 'hash', hash_algorithm: String(spec.algorithm ?? 'sha256') }
  }
  if (source === 'group' || source === 'object')
    return { mode: 'group', group: String(spec.group ?? spec.object ?? '') }
  return { mode: 'static', value: String(spec.default ?? '') }
}

function getUserVarPreviewValue(v: UserVariable): string {
  const spec = { type: v.type, source: 'generated', ...v.params }
  return getGeneratedPreviewValue(specToConfig(spec))
}

function configToSpec(config: VariableConfig): Record<string, unknown> {
  switch (config.mode) {
    case 'static':      return { type: 'string', default: config.value ?? '' }
    case 'ipv4_random': return { type: 'ipv4', source: 'generated' }
    case 'ipv4_cidr':   return { type: 'ipv4', source: 'generated', cidr: config.cidr ?? '' }
    case 'ipv4_range':  return { type: 'ipv4', source: 'generated', range: config.range ?? '' }
    case 'ipv6_random': return { type: 'ipv6', source: 'generated' }
    case 'integer':     return { type: 'integer', source: 'generated', min: Number(config.min ?? 1), max: Number(config.max ?? 9999) }
    case 'uuid':        return { type: 'uuid', source: 'generated' }
    case 'port':        return { type: 'port', source: 'generated' }
    case 'mac_address': return { type: 'mac_address', source: 'generated' }
    case 'hostname':    return { type: 'hostname', source: 'generated' }
    case 'username':    return { type: 'username', source: 'generated' }
    case 'hash':        return { type: 'hash', source: 'generated', algorithm: config.hash_algorithm ?? 'sha256' }
    case 'timestamp': {
      const offsetSec = config.ts_offset === 'Custom (seconds)'
        ? Number(config.ts_offset_custom ?? '0')
        : (OFFSET_OPTIONS.find((o) => o.label === config.ts_offset)?.seconds ?? 0)
      return { type: 'timestamp', source: 'generated', format: config.ts_format ?? 'rfc5424', offset_seconds: offsetSec }
    }
    case 'group': return { type: 'string', source: 'group', group: config.group ?? '' }
  }
}

// Resolution order for any placeholder: Object (My/Library Objects, same
// table) > My Variable > Library Variable > local per-block declaration.
// The catalog layers are the reliable fallback and always win, even over a
// local declaration already stored under the same name (e.g. leftover from
// before this placeholder existed in a catalog).

function syncVars(
  template: string,
  current: Record<string, VariableConfig>,
  excludedPlaceholders: Set<string>,
): Record<string, VariableConfig> {
  // Existing local declarations are preserved (so already-authored use cases keep
  // working unchanged), but a placeholder seen for the first time no longer gets
  // an auto-created blank "static" entry - it's left undefined so the Placeholders
  // panel can show "not yet defined" and guide toward a My Variable/My Object
  // instead of a dead-end freeform config.
  const detected = extractTemplateVars(template).filter((v) => !excludedPlaceholders.has(v))
  const next: Record<string, VariableConfig> = {}
  for (const name of detected) {
    if (current[name]) next[name] = current[name]
  }
  return next
}

function extractTemplateVars(template: string): string[] {
  return [...new Set([...template.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]))]
}

const LOG_FORMATS = [
  { value: 'syslog_rfc3164', label: 'Syslog RFC 3164' },
  { value: 'syslog_rfc5424', label: 'Syslog RFC 5424' },
  { value: 'cef', label: 'CEF' },
  { value: 'leef', label: 'LEEF' },
  { value: 'json', label: 'JSON' },
  { value: 'windows_evtxml', label: 'Windows EvtXML' },
  { value: 'custom', label: 'Custom' },
]

const VAR_MODES: { value: VarMode; label: string }[] = [
  { value: 'static',      label: 'Static value' },
  { value: 'timestamp',   label: 'Timestamp' },
  { value: 'uuid',        label: 'Random UUID' },
  { value: 'ipv4_random', label: 'Random IPv4' },
  { value: 'ipv4_cidr',   label: 'IPv4 from subnet (CIDR)' },
  { value: 'ipv4_range',  label: 'IPv4 from range' },
  { value: 'ipv6_random', label: 'Random IPv6' },
  { value: 'port',        label: 'Random port' },
  { value: 'mac_address', label: 'Random MAC address' },
  { value: 'hostname',    label: 'Random hostname' },
  { value: 'username',    label: 'Random username' },
  { value: 'integer',     label: 'Random integer' },
  { value: 'hash',        label: 'Hash value' },
  { value: 'group',       label: 'From My Objects' },
]

// ── MITRE ATT&CK taxonomy ────────────────────────────────────────────────────

const MITRE_TACTICS: { id: string; name: string }[] = [
  { id: 'TA0001', name: 'Initial Access' },
  { id: 'TA0002', name: 'Execution' },
  { id: 'TA0003', name: 'Persistence' },
  { id: 'TA0004', name: 'Privilege Escalation' },
  { id: 'TA0005', name: 'Defense Evasion' },
  { id: 'TA0006', name: 'Credential Access' },
  { id: 'TA0007', name: 'Discovery' },
  { id: 'TA0008', name: 'Lateral Movement' },
  { id: 'TA0009', name: 'Collection' },
  { id: 'TA0010', name: 'Exfiltration' },
  { id: 'TA0011', name: 'Command and Control' },
  { id: 'TA0040', name: 'Impact' },
  { id: 'TA0042', name: 'Resource Development' },
  { id: 'TA0043', name: 'Reconnaissance' },
]

const MITRE_TECHNIQUES: { id: string; name: string }[] = [
  { id: 'T1003',     name: 'OS Credential Dumping' },
  { id: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory' },
  { id: 'T1003.002', name: 'OS Credential Dumping: SAM' },
  { id: 'T1003.003', name: 'OS Credential Dumping: NTDS' },
  { id: 'T1003.004', name: 'OS Credential Dumping: LSA Secrets' },
  { id: 'T1003.006', name: 'OS Credential Dumping: DCSync' },
  { id: 'T1021',     name: 'Remote Services' },
  { id: 'T1021.001', name: 'Remote Services: Remote Desktop Protocol' },
  { id: 'T1021.002', name: 'Remote Services: SMB/Windows Admin Shares' },
  { id: 'T1021.004', name: 'Remote Services: SSH' },
  { id: 'T1021.006', name: 'Remote Services: Windows Remote Management' },
  { id: 'T1027',     name: 'Obfuscated Files or Information' },
  { id: 'T1040',     name: 'Network Sniffing' },
  { id: 'T1041',     name: 'Exfiltration Over C2 Channel' },
  { id: 'T1046',     name: 'Network Service Discovery' },
  { id: 'T1047',     name: 'Windows Management Instrumentation' },
  { id: 'T1048',     name: 'Exfiltration Over Alternative Protocol' },
  { id: 'T1049',     name: 'System Network Connections Discovery' },
  { id: 'T1053',     name: 'Scheduled Task/Job' },
  { id: 'T1053.005', name: 'Scheduled Task/Job: Scheduled Task' },
  { id: 'T1055',     name: 'Process Injection' },
  { id: 'T1057',     name: 'Process Discovery' },
  { id: 'T1059',     name: 'Command and Scripting Interpreter' },
  { id: 'T1059.001', name: 'Command and Scripting Interpreter: PowerShell' },
  { id: 'T1059.003', name: 'Command and Scripting Interpreter: Windows Command Shell' },
  { id: 'T1059.004', name: 'Command and Scripting Interpreter: Unix Shell' },
  { id: 'T1068',     name: 'Exploitation for Privilege Escalation' },
  { id: 'T1070',     name: 'Indicator Removal' },
  { id: 'T1070.001', name: 'Indicator Removal: Clear Windows Event Logs' },
  { id: 'T1071',     name: 'Application Layer Protocol' },
  { id: 'T1071.001', name: 'Application Layer Protocol: Web Protocols' },
  { id: 'T1071.002', name: 'Application Layer Protocol: File Transfer Protocols' },
  { id: 'T1071.004', name: 'Application Layer Protocol: DNS' },
  { id: 'T1078',     name: 'Valid Accounts' },
  { id: 'T1078.001', name: 'Valid Accounts: Default Accounts' },
  { id: 'T1078.002', name: 'Valid Accounts: Domain Accounts' },
  { id: 'T1078.003', name: 'Valid Accounts: Local Accounts' },
  { id: 'T1082',     name: 'System Information Discovery' },
  { id: 'T1083',     name: 'File and Directory Discovery' },
  { id: 'T1087',     name: 'Account Discovery' },
  { id: 'T1087.001', name: 'Account Discovery: Local Account' },
  { id: 'T1087.002', name: 'Account Discovery: Domain Account' },
  { id: 'T1090',     name: 'Proxy' },
  { id: 'T1095',     name: 'Non-Application Layer Protocol' },
  { id: 'T1098',     name: 'Account Manipulation' },
  { id: 'T1105',     name: 'Ingress Tool Transfer' },
  { id: 'T1110',     name: 'Brute Force' },
  { id: 'T1110.001', name: 'Brute Force: Password Guessing' },
  { id: 'T1110.002', name: 'Brute Force: Password Cracking' },
  { id: 'T1110.003', name: 'Brute Force: Password Spraying' },
  { id: 'T1110.004', name: 'Brute Force: Credential Stuffing' },
  { id: 'T1133',     name: 'External Remote Services' },
  { id: 'T1134',     name: 'Access Token Manipulation' },
  { id: 'T1136',     name: 'Create Account' },
  { id: 'T1136.001', name: 'Create Account: Local Account' },
  { id: 'T1136.002', name: 'Create Account: Domain Account' },
  { id: 'T1190',     name: 'Exploit Public-Facing Application' },
  { id: 'T1203',     name: 'Exploitation for Client Execution' },
  { id: 'T1204',     name: 'User Execution' },
  { id: 'T1210',     name: 'Exploitation of Remote Services' },
  { id: 'T1213',     name: 'Data from Information Repositories' },
  { id: 'T1218',     name: 'System Binary Proxy Execution' },
  { id: 'T1218.011', name: 'System Binary Proxy Execution: Rundll32' },
  { id: 'T1219',     name: 'Remote Access Software' },
  { id: 'T1486',     name: 'Data Encrypted for Impact' },
  { id: 'T1489',     name: 'Service Stop' },
  { id: 'T1490',     name: 'Inhibit System Recovery' },
  { id: 'T1496',     name: 'Resource Hijacking' },
  { id: 'T1499',     name: 'Endpoint Denial of Service' },
  { id: 'T1505',     name: 'Server Software Component' },
  { id: 'T1505.003', name: 'Server Software Component: Web Shell' },
  { id: 'T1518',     name: 'Software Discovery' },
  { id: 'T1518.001', name: 'Software Discovery: Security Software Discovery' },
  { id: 'T1528',     name: 'Steal Application Access Token' },
  { id: 'T1531',     name: 'Account Access Removal' },
  { id: 'T1539',     name: 'Steal Web Session Cookie' },
  { id: 'T1543',     name: 'Create or Modify System Process' },
  { id: 'T1543.003', name: 'Create or Modify System Process: Windows Service' },
  { id: 'T1547',     name: 'Boot or Logon Autostart Execution' },
  { id: 'T1547.001', name: 'Boot or Logon Autostart Execution: Registry Run Keys' },
  { id: 'T1548',     name: 'Abuse Elevation Control Mechanism' },
  { id: 'T1548.002', name: 'Abuse Elevation Control Mechanism: Bypass UAC' },
  { id: 'T1550',     name: 'Use Alternate Authentication Material' },
  { id: 'T1550.002', name: 'Use Alternate Authentication Material: Pass the Hash' },
  { id: 'T1552',     name: 'Unsecured Credentials' },
  { id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files' },
  { id: 'T1556',     name: 'Modify Authentication Process' },
  { id: 'T1558',     name: 'Steal or Forge Kerberos Tickets' },
  { id: 'T1558.001', name: 'Steal or Forge Kerberos Tickets: Golden Ticket' },
  { id: 'T1558.003', name: 'Steal or Forge Kerberos Tickets: Kerberoasting' },
  { id: 'T1560',     name: 'Archive Collected Data' },
  { id: 'T1562',     name: 'Impair Defenses' },
  { id: 'T1562.001', name: 'Impair Defenses: Disable or Modify Tools' },
  { id: 'T1566',     name: 'Phishing' },
  { id: 'T1566.001', name: 'Phishing: Spearphishing Attachment' },
  { id: 'T1566.002', name: 'Phishing: Spearphishing Link' },
  { id: 'T1567',     name: 'Exfiltration Over Web Service' },
  { id: 'T1569',     name: 'System Services' },
  { id: 'T1569.002', name: 'System Services: Service Execution' },
  { id: 'T1570',     name: 'Lateral Tool Transfer' },
  { id: 'T1571',     name: 'Non-Standard Port' },
  { id: 'T1572',     name: 'Protocol Tunneling' },
  { id: 'T1573',     name: 'Encrypted Channel' },
  { id: 'T1574',     name: 'Hijack Execution Flow' },
  { id: 'T1583',     name: 'Acquire Infrastructure' },
  { id: 'T1584',     name: 'Compromise Infrastructure' },
  { id: 'T1585',     name: 'Establish Accounts' },
  { id: 'T1586',     name: 'Compromise Accounts' },
  { id: 'T1589',     name: 'Gather Victim Identity Information' },
  { id: 'T1590',     name: 'Gather Victim Network Information' },
  { id: 'T1595',     name: 'Active Scanning' },
  { id: 'T1595.001', name: 'Active Scanning: Scanning IP Blocks' },
]

// ── MITRE tag input ──────────────────────────────────────────────────────────

function splitTags(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}

function MitreTagInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: { id: string; name: string }[]
  placeholder?: string
}) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const tags = splitTags(value)
  const q = input.toLowerCase()
  const filtered = input.length > 0
    ? suggestions
        .filter((s) =>
          (s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)) &&
          !tags.includes(s.id)
        )
        .slice(0, 8)
    : []

  const addTag = (tag: string) => {
    const next = [...tags, tag].filter(Boolean)
    onChange(next.join(', '))
    setInput('')
    setOpen(false)
    setHighlighted(0)
    inputRef.current?.focus()
  }

  const removeTag = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx).join(', '))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && input === '' && tags.length > 0) {
      removeTag(tags.length - 1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) addTag(filtered[highlighted].id)
      else if (input.trim()) addTag(input.trim().toUpperCase())
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)) }
    if (e.key === 'Escape')    setOpen(false)
  }

  useEffect(() => {
    setHighlighted(0)
    setOpen(input.length > 0 && filtered.length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="min-h-[38px] flex flex-wrap gap-1.5 items-center px-3 py-2 bg-slate-700 border border-slate-600 rounded-md focus-within:border-blue-500 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-600 text-blue-200 text-xs rounded font-mono">
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i) }}
              className="text-slate-400 hover:text-slate-100 leading-none"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-24 bg-transparent text-white text-sm placeholder-slate-400 outline-none"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-slate-800 border border-slate-600 rounded-md shadow-xl max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s.id) }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-3 ${i === highlighted ? 'bg-blue-700/40' : 'hover:bg-slate-700'}`}
            >
              <span className="font-mono text-xs text-blue-300 w-20 flex-none">{s.id}</span>
              <span className="text-slate-300 truncate text-xs">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Form state ───────────────────────────────────────────────────────────────

interface LogEventFormState {
  format: string
  template: string
  variables: Record<string, VariableConfig>
  delay_ms: string
  repeat: string
}

interface FormState {
  name: string
  description: string
  log_events: LogEventFormState[]
  tags: string
  mitre_tactics: string
  mitre_techniques: string
  target_id: string
  run_count: string
  run_delay_ms: string
}

const EMPTY_EVENT: LogEventFormState = {
  format: 'syslog_rfc5424',
  template: '',
  variables: {},
  delay_ms: '',
  repeat: '',
}

const EMPTY: FormState = {
  name: '',
  description: '',
  log_events: [{ ...EMPTY_EVENT }],
  tags: '',
  mitre_tactics: '',
  mitre_techniques: '',
  target_id: '',
  run_count: '1',
  run_delay_ms: '1',
}

// ── Component ────────────────────────────────────────────────────────────────

export default function UseCaseFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = id !== undefined
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [destinations, setDestinations] = useState<DestinationProfile[]>([])
  const [destinationsLoading, setDestinationsLoading] = useState(true)
  const [objectGroups, setObjectGroups] = useState<ObjectGroup[]>([])
  const [userVariables, setUserVariables] = useState<UserVariable[]>([])
  const [createModalFor, setCreateModalFor] = useState<{ name: string; kind: 'variable' | 'object' } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playResult, setPlayResult] = useState<{ bytes: number; cancelled: boolean } | null>(null)
  const [applyAndRunning, setApplyAndRunning] = useState(false)
  const [applyAndRunResult, setApplyAndRunResult] = useState<{ bytes: number; cancelled: boolean } | null>(null)
  const [runningUseCaseId, setRunningUseCaseId] = useState<number | null>(null)
  const [stopping, setStopping] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    void getUseCase(Number(id))
      .then((uc) => {
        setForm({
          name: uc.name,
          description: uc.description,
          log_events: uc.log_events.length > 0
            ? uc.log_events.map((ev) => {
                const rawVars = (ev.variables ?? {}) as Record<string, Record<string, unknown>>
                const variables: Record<string, VariableConfig> = {}
                for (const [k, spec] of Object.entries(rawVars)) variables[k] = specToConfig(spec)
                return {
                  format: ev.format,
                  template: ev.template,
                  variables,
                  delay_ms: ev.delay_ms !== undefined ? String(ev.delay_ms) : '',
                  repeat: ev.repeat !== undefined && ev.repeat !== 1 ? String(ev.repeat) : '',
                }
              })
            : [{ ...EMPTY_EVENT }],
          tags: uc.tags.join(', '),
          mitre_tactics: uc.mitre_tactics.join(', '),
          mitre_techniques: uc.mitre_techniques.join(', '),
          target_id: uc.target_ids[0] ?? '',
          run_count: String(uc.run_count ?? 1),
          run_delay_ms: String(uc.run_delay_ms ?? 1),
        })
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load use case'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  useEffect(() => {
    void listDestinations(undefined, 200, ['private'])
      .then((page) => setDestinations(page.items))
      .catch(() => {})
      .finally(() => setDestinationsLoading(false))
  }, [])

  useEffect(() => {
    void listObjects(undefined, 100)
      .then((page) => setObjectGroups(page.items))
      .catch(() => {})
  }, [])

  useEffect(() => {
    void listUserVariables()
      .then((page) => setUserVariables(page.items))
      .catch(() => {})
  }, [])

  const objPlaceholders = new Set(objectGroups.map((o) => o.placeholder))
  const userVarPlaceholders = new Set(userVariables.map((v) => v.placeholder))
  const builtinPlaceholders = new Set(CATALOG.map((e) => e.placeholder))
  const excludedPlaceholders = new Set([...objPlaceholders, ...userVarPlaceholders, ...builtinPlaceholders])

  const editorCompletions: CompletionItem[] = [
    ...objectGroups.map((o) => ({ name: o.placeholder, detail: `Object - ${o.name}` })),
    ...userVariables.map((v) => ({ name: v.placeholder, detail: `My Variable - ${v.name}` })),
    ...CATALOG.filter((e) => !userVarPlaceholders.has(e.placeholder))
      .map((e) => ({ name: e.placeholder, detail: `Library Variable - ${e.label}` })),
  ]

  const set =
    (key: keyof Omit<FormState, 'log_events'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
    }

  const setEventFormat = (idx: number, format: string) =>
    setForm((prev) => {
      const log_events = [...prev.log_events]
      log_events[idx] = { ...log_events[idx], format }
      return { ...prev, log_events }
    })

  const setEventField = (idx: number, field: 'delay_ms' | 'repeat', value: string) =>
    setForm((prev) => {
      const log_events = [...prev.log_events]
      log_events[idx] = { ...log_events[idx], [field]: value }
      return { ...prev, log_events }
    })

  const handleTemplateChange = (idx: number, value: string) => {
    setForm((prev) => {
      const log_events = [...prev.log_events]
      log_events[idx] = {
        ...log_events[idx],
        template: value,
        variables: syncVars(value, log_events[idx].variables, excludedPlaceholders),
      }
      return { ...prev, log_events }
    })
  }

  const addEvent = () =>
    setForm((prev) => ({
      ...prev,
      log_events: [
        ...prev.log_events,
        { ...EMPTY_EVENT, format: prev.log_events[prev.log_events.length - 1]?.format ?? 'syslog_rfc5424' },
      ],
    }))

  const removeEvent = (idx: number) =>
    setForm((prev) => ({ ...prev, log_events: prev.log_events.filter((_, i) => i !== idx) }))

  // A "not yet defined" placeholder like {{ src_ip }} that gets resolved via
  // Create My Variable/Object doesn't necessarily keep the same placeholder
  // text - UserVariable placeholders always gain a leading underscore
  // server-side, and either side can be renamed or de-duplicated on save. So
  // once creation succeeds, rewrite every occurrence of the old placeholder
  // across all Log Blocks to the placeholder the catalog actually assigned -
  // otherwise the template still points at a name nothing resolves.
  const replacePlaceholderInTemplates = (oldName: string, newName: string) => {
    if (oldName === newName) return
    const pattern = new RegExp(`\\{\\{\\s*${oldName}\\s*\\}\\}`, 'g')
    setForm((prev) => ({
      ...prev,
      log_events: prev.log_events.map((ev) => ({
        ...ev,
        template: ev.template.replace(pattern, `{{ ${newName} }}`),
      })),
    }))
  }

  const buildPayload = () => ({
    name: form.name,
    description: form.description,
    log_events: form.log_events.map((ev, idx): LogEvent => {
      const variables: Record<string, unknown> = {}
      const templateVarSet = new Set(extractTemplateVars(ev.template))
      for (const placeholder of templateVarSet) {
        const obj = objectGroups.find((o) => o.placeholder === placeholder)
        if (obj) continue // resolved separately by the backend via template scan
        const userVar = userVariables.find((v) => v.placeholder === placeholder)
        if (userVar) {
          variables[placeholder] = { type: userVar.type, source: 'generated', ...userVar.params }
          continue
        }
        const builtin = BUILTIN_VARIABLES_BY_PLACEHOLDER.get(placeholder)
        if (builtin) {
          variables[placeholder] = { ...builtin.fullSpec }
          continue
        }
        const cfg = ev.variables[placeholder]
        if (cfg) variables[placeholder] = configToSpec(cfg)
      }
      return {
        sequence: idx + 1,
        format: ev.format,
        template: ev.template,
        variables,
        ...(ev.delay_ms && Number(ev.delay_ms) > 0 ? { delay_ms: Number(ev.delay_ms) } : {}),
        ...(ev.repeat !== '' && Number(ev.repeat) !== 1 ? { repeat: Number(ev.repeat) } : {}),
      }
    }),
    tags: splitTags(form.tags),
    mitre_tactics: splitTags(form.mitre_tactics),
    mitre_techniques: splitTags(form.mitre_techniques),
    target_ids: form.target_id ? [form.target_id] : [],
    run_count: Math.max(1, parseInt(form.run_count) || 1),
    run_delay_ms: Math.max(1, parseInt(form.run_delay_ms) || 1),
  })

  const handleStop = async () => {
    if (runningUseCaseId === null) return
    setStopping(true)
    try {
      await cancelUseCaseSend(runningUseCaseId)
    } catch {
      // Send may have already finished on its own - nothing to do.
    } finally {
      setStopping(false)
    }
  }

  const handlePlay = async () => {
    if (!id || !form.target_id) return
    setPlaying(true)
    setPlayResult(null)
    const ucId = Number(id)
    setRunningUseCaseId(ucId)
    try {
      const res = await sendUseCase(ucId, parseInt(form.target_id))
      setPlayResult({ bytes: res.bytes_sent, cancelled: res.cancelled })
      setTimeout(() => setPlayResult(null), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setPlaying(false)
      setRunningUseCaseId(null)
    }
  }

  const handleSaveAndRun = async () => {
    if (!form.target_id) return
    setSaving(true)
    setError(null)
    try {
      const uc = await createUseCase(buildPayload())
      setRunningUseCaseId(uc.id)
      try {
        await sendUseCase(uc.id, parseInt(form.target_id))
      } finally {
        setRunningUseCaseId(null)
      }
      navigate(`/use-cases/${uc.id}/edit`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save & Run failed')
    } finally {
      setSaving(false)
    }
  }

  const handleApplyAndRun = async () => {
    if (!form.target_id) return
    setApplyAndRunning(true)
    setApplyAndRunResult(null)
    setError(null)
    try {
      const ucId = isEdit ? Number(id) : (await createUseCase(buildPayload())).id
      if (isEdit) await updateUseCase(ucId, buildPayload())
      else navigate(`/use-cases/${ucId}/edit`, { replace: true })
      setRunningUseCaseId(ucId)
      const res = await sendUseCase(ucId, parseInt(form.target_id))
      setApplyAndRunResult({ bytes: res.bytes_sent, cancelled: res.cancelled })
      setTimeout(() => setApplyAndRunResult(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply & Run failed')
    } finally {
      setApplyAndRunning(false)
      setRunningUseCaseId(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) await updateUseCase(Number(id), buildPayload())
      else await createUseCase(buildPayload())
      navigate('/use-cases')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    try {
      if (isEdit) {
        await updateUseCase(Number(id), buildPayload())
      } else {
        const uc = await createUseCase(buildPayload())
        navigate(`/use-cases/${uc.id}/edit`, { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading...</div>

  return (
    <div className="p-6 max-w-7xl">
      {createModalFor?.kind === 'variable' && (
        <CreateVariableModal
          initialName={createModalFor.name}
          existingCategories={userVariables.map((v) => v.category)}
          onClose={() => setCreateModalFor(null)}
          onCreated={(v) => {
            setUserVariables((prev) => [...prev, v])
            replacePlaceholderInTemplates(createModalFor.name, v.placeholder)
            setCreateModalFor(null)
          }}
        />
      )}
      {createModalFor?.kind === 'object' && (
        <CreateObjectModal
          initialName={createModalFor.name}
          existingCategories={objectGroups.map((o) => o.category ?? '')}
          onClose={() => setCreateModalFor(null)}
          onCreated={(obj) => {
            setObjectGroups((prev) => [...prev, obj])
            replacePlaceholderInTemplates(createModalFor.name, obj.placeholder)
            setCreateModalFor(null)
          }}
        />
      )}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/use-cases')}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-semibold text-white">
          {isEdit ? 'Edit Use Case' : 'New Use Case'}
        </h1>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
          <input
            type="text"
            required
            value={form.name}
            onChange={set('name')}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="SSH Brute Force"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={set('description')}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm resize-y"
            placeholder="Simulates SSH authentication failures"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Destination
            {!destinationsLoading && destinations.length === 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-400 text-xs font-normal">
                <AlertTriangle className="w-3.5 h-3.5" />
                No destinations - add one in My Destinations first
              </span>
            )}
          </label>
          <select
            value={form.target_id}
            onChange={set('target_id')}
            disabled={destinations.length === 0}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:border-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Select destination...</option>
            {destinations.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name} - {d.host}:{d.port} ({d.protocol.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        {/* ── Log Blocks ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-300">Log Blocks</label>
            <div className="flex items-center gap-2">
              {applyAndRunResult ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-green-400">
                  <CheckCircle className="w-3.5 h-3.5 flex-none" />
                  {applyAndRunResult.cancelled ? 'Stopped - ' : ''}
                  {applyAndRunResult.bytes}B sent
                </span>
              ) : applyAndRunning ? (
                <button
                  type="button"
                  onClick={() => void handleStop()}
                  disabled={stopping}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
                >
                  <Square className="w-3.5 h-3.5 flex-none" fill="currentColor" />
                  {stopping ? 'Stopping...' : 'Stop'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleApplyAndRun()}
                  disabled={!form.target_id}
                  title={!form.target_id ? 'Select a destination first' : 'Apply changes and run'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                >
                  <Play className="w-3.5 h-3.5 flex-none" />
                  Apply & Run
                </button>
              )}
              <button
                type="button"
                onClick={addEvent}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-slate-800 border border-slate-700 rounded transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Log Block
              </button>
            </div>
          </div>

          {form.log_events.map((ev, evIdx) => {
            const evVars = extractTemplateVars(ev.template)
            return (
              <div key={evIdx} className="rounded-lg border border-slate-700 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/60 border-b border-slate-700">
                  {form.log_events.length > 1 && (
                    <span className="text-xs font-semibold text-slate-400 flex-none w-20">
                      Log Block {evIdx + 1}
                    </span>
                  )}
                  <select
                    value={ev.format}
                    onChange={(e) => setEventFormat(evIdx, e.target.value)}
                    className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    {LOG_FORMATS.map((f) => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Delay</span>
                    <input
                      type="number"
                      min="0"
                      value={ev.delay_ms}
                      onChange={(e) => setEventField(evIdx, 'delay_ms', e.target.value)}
                      placeholder="0"
                      className="w-20 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <span>ms</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Repeat</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="0|[1-9][0-9]?|1[01][0-9]|12[0-8]"
                      maxLength={3}
                      value={ev.repeat}
                      onChange={(e) => {
                        const digitsOnly = e.target.value.replace(/[^0-9]/g, '')
                        if (digitsOnly === '') {
                          setEventField(evIdx, 'repeat', '')
                          return
                        }
                        const clamped = Math.min(128, Number(digitsOnly))
                        setEventField(evIdx, 'repeat', String(clamped))
                      }}
                      placeholder="1"
                      title="0 skips this log block entirely (range 0-128)"
                      className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="flex-1" />
                  {form.log_events.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeEvent(evIdx)}
                      className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors"
                      title="Remove log block"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4">
                  <TemplateEditor
                    value={ev.template}
                    onChange={(value) => handleTemplateChange(evIdx, value)}
                    logFormat={ev.format}
                    completionItems={editorCompletions}
                    previewValues={{
                      ...Object.fromEntries(
                        Object.entries(ev.variables).map(([k, cfg]) => [k, getGeneratedPreviewValue(cfg)])
                      ),
                      ...Object.fromEntries(
                        evVars
                          .filter((v) => !(v in ev.variables))
                          .flatMap((v) => {
                            const obj = objectGroups.find((o) => o.placeholder === v)
                            if (obj) return [[v, getObjectPreviewValue(obj)]]
                            const userVar = userVariables.find((uv) => uv.placeholder === v)
                            if (userVar) return [[v, getUserVarPreviewValue(userVar)]]
                            const builtin = BUILTIN_VARIABLES_BY_PLACEHOLDER.get(v)
                            if (builtin) return [[v, getGeneratedPreviewValue(specToConfig(builtin.fullSpec))]]
                            return []
                          })
                      ),
                    }}
                  />
                </div>

                {evVars.length > 0 && (
                  <div className="border-t border-slate-700">
                    <div className="px-4 py-2 border-b border-slate-700/60 bg-slate-800/30">
                      <span className="text-xs font-medium text-slate-400">Placeholders</span>
                      <span className="ml-2 text-slate-600 text-xs font-normal">
                        configure how each resolves at send time
                      </span>
                    </div>
                    <div className="divide-y divide-slate-700/60">
                      {evVars.map((name) => {
                        const localCfg = ev.variables[name]
                        // A local declaration only counts as a meaningful collision if it
                        // actually differs from what the catalog would produce - saving a
                        // catalog-matched placeholder through the editor writes its spec
                        // into storage verbatim (needed so the backend can resolve it
                        // independently of this catalog), so an identical stored entry is
                        // expected steady state, not something to warn about.
                        const differsFromCatalog = (catalogSpec: Record<string, unknown>) =>
                          localCfg !== undefined &&
                          JSON.stringify(localCfg) !== JSON.stringify(specToConfig(catalogSpec))
                        const collisionWarning = (sourceLabel: string, show: boolean) =>
                          show ? (
                            <span
                              title={`A local value is also stored for {{ ${name} }} in this Log Block but is ignored - the ${sourceLabel} definition always takes priority. Remove the local declaration or rename the placeholder to avoid confusion.`}
                              className="flex-none text-amber-400"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </span>
                          ) : null

                        const obj = objectGroups.find((o) => o.placeholder === name)
                        if (obj !== undefined) {
                          return (
                            <div key={name} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex items-center gap-1.5 w-40 flex-none min-w-0">
                                <span title="Object - value list from My Objects" className="flex-none">
                                  <Package className="w-3.5 h-3.5 text-slate-500" />
                                </span>
                                <code className="text-xs text-slate-400 font-mono truncate">{`{{ ${name} }}`}</code>
                                {collisionWarning(
                                  'Object',
                                  localCfg !== undefined &&
                                    JSON.stringify(localCfg) !==
                                      JSON.stringify({ mode: 'static', value: getObjectPreviewValue(obj) }),
                                )}
                              </div>
                              <span className="w-52 flex-none text-xs text-slate-500 italic truncate">{obj.name}</span>
                              <div className="flex-1" />
                              <code className="text-xs font-mono text-green-400 flex-none w-44 truncate">
                                {getObjectPreviewValue(obj)}
                              </code>
                            </div>
                          )
                        }

                        const userVar = userVariables.find((v) => v.placeholder === name)
                        if (userVar !== undefined) {
                          const userVarSpec = { type: userVar.type, source: 'generated', ...userVar.params }
                          return (
                            <div key={name} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex items-center gap-1.5 w-40 flex-none min-w-0">
                                <span title="Variable - preset from My Variables" className="flex-none">
                                  <Braces className="w-3.5 h-3.5 text-blue-400" />
                                </span>
                                <code className="text-xs text-blue-300 font-mono truncate">{`{{ ${name} }}`}</code>
                                {collisionWarning('My Variable', differsFromCatalog(userVarSpec))}
                              </div>
                              <span className="w-52 flex-none text-xs text-slate-400 italic truncate">{userVar.name}</span>
                              <div className="flex-1 flex items-center">
                                <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-700 text-slate-400">
                                  {userVar.type}
                                </span>
                              </div>
                              <code className="text-xs font-mono text-green-400 flex-none w-44 truncate">
                                {getUserVarPreviewValue(userVar)}
                              </code>
                            </div>
                          )
                        }

                        const builtin = BUILTIN_VARIABLES_BY_PLACEHOLDER.get(name)
                        if (builtin !== undefined) {
                          return (
                            <div key={name} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex items-center gap-1.5 w-40 flex-none min-w-0">
                                <span title="Variable - built-in from Library, not cloned" className="flex-none">
                                  <Braces className="w-3.5 h-3.5 text-blue-400" />
                                </span>
                                <code className="text-xs text-blue-300 font-mono truncate">{`{{ ${name} }}`}</code>
                                {collisionWarning('Library Variable', differsFromCatalog(builtin.fullSpec))}
                              </div>
                              <span className="w-52 flex-none text-xs text-slate-400 italic truncate">{builtin.label}</span>
                              <div className="flex-1 flex items-center">
                                <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-700 text-slate-400">
                                  {builtin.type}
                                </span>
                              </div>
                              <code className="text-xs font-mono text-green-400 flex-none w-44 truncate">
                                {getGeneratedPreviewValue(specToConfig(builtin.fullSpec))}
                              </code>
                            </div>
                          )
                        }

                        const cfg = ev.variables[name]
                        if (cfg !== undefined) {
                          // Every local declaration mode - including "static" - now has a
                          // better home: a literal one-off value belongs directly in the
                          // template text, not behind a placeholder, and every generator mode
                          // (timestamp, ipv4_random, group, ...) has a direct My
                          // Variable/My Object equivalent. So these render read-only: the
                          // preview stays accurate, but the fix is migrating away from the
                          // local spec, not editing it in place.
                          const modeLabel = VAR_MODES.find((m) => m.value === cfg.mode)?.label ?? cfg.mode
                          return (
                            <div key={name} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex items-center gap-1.5 w-40 flex-none min-w-0">
                                <span title="Legacy local declaration - consider migrating to a My Variable or My Object" className="flex-none">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                </span>
                                <code className="text-xs text-amber-300 font-mono truncate">{`{{ ${name} }}`}</code>
                              </div>
                              <span className="w-52 flex-none text-xs text-slate-500 italic truncate">{modeLabel} (legacy local)</span>
                              <div className="flex-1" />
                              <code className="text-xs font-mono text-green-400 flex-none w-44 truncate">
                                {getGeneratedPreviewValue(cfg)}
                              </code>
                            </div>
                          )
                        }

                        return (
                          <div key={name} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex items-center gap-1.5 w-40 flex-none min-w-0">
                              <span title="Not yet defined" className="flex-none">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              </span>
                              <code className="text-xs text-amber-300 font-mono truncate">{`{{ ${name} }}`}</code>
                            </div>
                            <span className="w-52 flex-none text-xs text-slate-500 italic truncate">Not yet defined</span>
                            <div className="flex-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setCreateModalFor({ name, kind: 'variable' })}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-xs text-blue-300 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Create My Variable
                              </button>
                              <span
                                title="Generates a fresh random value every time this use case runs (e.g. a random IP, timestamp, port, hash)"
                                className="flex-none text-slate-500 hover:text-slate-300 cursor-help"
                              >
                                <HelpCircle className="w-3.5 h-3.5" />
                              </span>
                              <button
                                type="button"
                                onClick={() => setCreateModalFor({ name, kind: 'object' })}
                                className="flex items-center gap-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded text-xs text-slate-300 transition-colors"
                              >
                                <Plus className="w-3 h-3" />
                                Create My Object
                              </button>
                              <span
                                title="Resolves to a value picked from a specific list you maintain (e.g. your organization's real hostnames or IPs) - not randomly generated"
                                className="flex-none text-slate-500 hover:text-slate-300 cursor-help"
                              >
                                <HelpCircle className="w-3.5 h-3.5" />
                              </span>
                            </div>
                            <span className="flex-none w-44" />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Tags
              <span className="text-slate-500 font-normal ml-1">(comma separated)</span>
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={set('tags')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="windows, auth, brute-force"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Repeat all log blocks
              <span className="text-slate-500 font-normal ml-1">(Run count x Interval between runs)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="1"
                  value={form.run_count}
                  onChange={set('run_count')}
                  className="w-full px-2 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
                  title="Run count - how many times to repeat the full log block sequence"
                />
                <span className="text-slate-500 text-xs flex-none">x</span>
              </div>
              <div className="flex items-center gap-1.5 flex-1">
                <input
                  type="number"
                  min="1"
                  value={form.run_delay_ms}
                  onChange={set('run_delay_ms')}
                  className="w-full px-2 py-2 bg-slate-700 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-blue-500"
                  title="Interval between runs in milliseconds"
                />
                <span className="text-slate-500 text-xs flex-none">ms</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">MITRE Tactics</label>
            <MitreTagInput
              value={form.mitre_tactics}
              onChange={(v) => setForm((prev) => ({ ...prev, mitre_tactics: v }))}
              suggestions={MITRE_TACTICS}
              placeholder="TA0006, TA0008..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">MITRE Techniques</label>
            <MitreTagInput
              value={form.mitre_techniques}
              onChange={(v) => setForm((prev) => ({ ...prev, mitre_techniques: v }))}
              suggestions={MITRE_TECHNIQUES}
              placeholder="T1110, T1110.001..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-40 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Use Case'}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className="w-28 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          )}
          {isEdit ? (
            playResult ? (
              <span className="w-28 flex items-center justify-center gap-1.5 text-sm text-green-400">
                <CheckCircle className="w-4 h-4 flex-none" />
                {playResult.cancelled ? 'Stopped - ' : ''}
                {playResult.bytes}B sent
              </span>
            ) : playing ? (
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={stopping}
                className="w-28 flex items-center justify-center gap-2 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
              >
                <Square className="w-4 h-4 flex-none" fill="currentColor" />
                {stopping ? 'Stopping...' : 'Stop'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handlePlay()}
                disabled={!form.target_id}
                title={!form.target_id ? 'Select a destination first' : 'Run use case'}
                className="w-28 flex items-center justify-center gap-2 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors"
              >
                <Play className="w-4 h-4 flex-none" />
                Run
              </button>
            )
          ) : (
            form.target_id &&
            (runningUseCaseId !== null ? (
              <button
                type="button"
                onClick={() => void handleStop()}
                disabled={stopping}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
              >
                <Square className="w-4 h-4 flex-none" fill="currentColor" />
                {stopping ? 'Stopping...' : 'Stop'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSaveAndRun()}
                disabled={saving}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
              >
                <Play className="w-4 h-4 flex-none" />
                {saving ? 'Running...' : 'Save & Run'}
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => navigate('/use-cases')}
            className="w-28 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
