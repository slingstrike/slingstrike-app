import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Braces, Check, Copy, Info, RefreshCw, Search, X } from 'lucide-react'
import { createUserVariable } from '../api/userVariables'
import { CATALOG, cloneParams, type CatalogEntry } from '../features/editor/builtinVariables'

const CATEGORY_ORDER = ['Time', 'Network', 'Identity', 'Unique IDs', 'Numeric', 'Cryptographic']

const CATEGORY_BADGE: Record<string, string> = {
  'Time':          'bg-rose-900/60 text-rose-300',
  'Network':       'bg-blue-900/60 text-blue-300',
  'Identity':      'bg-green-900/60 text-green-300',
  'Unique IDs':    'bg-purple-900/60 text-purple-300',
  'Numeric':       'bg-amber-900/60 text-amber-300',
  'Cryptographic': 'bg-slate-700 text-slate-300',
}

// ── Live preview generation ────────────────────────────────────────────────

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generatePreview(type: string, spec: Record<string, unknown> = {}): string {
  switch (type) {
    case 'timestamp':
      return new Date().toISOString()
    case 'ipv4':
      return `${rand(1, 254)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`
    case 'ipv6':
      return Array.from({ length: 8 }, () => rand(0, 0xffff).toString(16)).join(':')
    case 'port':
      return String(rand(Number(spec.min ?? 1024), Number(spec.max ?? 65535)))
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
      return String(rand(Number(spec.min ?? 1000), Number(spec.max ?? 9999)))
    case 'hash':
      return Array.from({ length: 64 }, () => rand(0, 15).toString(16)).join('')
    default:
      return ''
  }
}

// ── Filter ─────────────────────────────────────────────────────────────────

function filterCatalog(
  entries: CatalogEntry[],
  query: string,
  activeCategory: string | null,
): CatalogEntry[] {
  const q = query.toLowerCase().trim()
  return entries.filter((e) => {
    if (activeCategory && e.category !== activeCategory) return false
    if (!q) return true
    return (
      e.label.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.placeholder.toLowerCase().includes(q)
    )
  })
}

// ── Placeholder chip ───────────────────────────────────────────────────────

function PlaceholderChip({ placeholder }: { placeholder: string }) {
  const [copied, setCopied] = useState(false)
  const text = `{{ ${placeholder} }}`

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy placeholder to clipboard"
      className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 transition-colors"
    >
      <span>{text}</span>
      {copied
        ? <Check className="w-3 h-3 text-green-400 flex-none" />
        : <Copy className="w-3 h-3 text-slate-500 flex-none" />}
    </button>
  )
}

// ── Snippet block (inside modal) ───────────────────────────────────────────

function SnippetBlock({ entry }: { entry: CatalogEntry }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(entry.snippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="rounded border border-slate-700 bg-slate-950 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/60">
        <span className="text-xs text-slate-500 font-medium">Variable Builder spec</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          {copied
            ? <><Check className="w-3 h-3 text-green-400" /> Copied</>
            : <><Copy className="w-3 h-3" /> Copy</>}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre">
        {entry.snippet}
      </pre>
    </div>
  )
}

// ── Detail modal ───────────────────────────────────────────────────────────

function VariableDetailModal({
  entry,
  onClose,
}: {
  entry: CatalogEntry
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [preview, setPreview] = useState(() => generatePreview(entry.type, entry.fullSpec))
  const [cloning, setCloning] = useState(false)
  const badgeCls = CATEGORY_BADGE[entry.category] ?? 'bg-slate-700 text-slate-300'

  const handleClone = async () => {
    setCloning(true)
    try {
      const v = await createUserVariable({
        name: entry.label,
        description: entry.description,
        type: entry.type,
        category: entry.category,
        params: cloneParams(entry.fullSpec),
      })
      onClose()
      navigate(`/my-variables/${v.id}/edit`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Clone failed'
      alert(msg.includes('409') || msg.includes('already exists')
        ? `A variable named "${entry.label}" already exists in My Variables. Rename it first.`
        : msg)
    } finally {
      setCloning(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">{entry.label}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${badgeCls}`}>
                {entry.type}
              </span>
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {entry.category}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors ml-3 flex-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {/* Description */}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
            <p className="text-sm text-slate-300">{entry.description}</p>
          </div>

          {/* Placeholder */}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">Placeholder</p>
            <PlaceholderChip placeholder={entry.placeholder} />
          </div>

          {/* Parameters */}
          {entry.params.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Parameters</p>
              <div className="rounded border border-slate-700 bg-slate-950 divide-y divide-slate-700/60">
                {entry.params.map((p) => (
                  <div key={p.name} className="px-3 py-2 flex gap-3 text-xs">
                    <span className="font-mono text-slate-300 w-32 flex-none">{p.name}</span>
                    <span className="text-slate-600 w-16 flex-none">{p.type}</span>
                    {p.default !== undefined && (
                      <span className="text-slate-600 w-28 flex-none">
                        default: <span className="text-slate-400">{p.default}</span>
                      </span>
                    )}
                    <span className="text-slate-500">{p.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-slate-500 font-medium">Live preview</p>
              <button
                onClick={() => setPreview(generatePreview(entry.type, entry.fullSpec))}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-400 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
            </div>
            <code className="block w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-xs font-mono text-green-400 break-all">
              {preview}
            </code>
          </div>

          {/* YAML snippet */}
          <SnippetBlock entry={entry} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Clone to configure params for your environment.</p>
          <div className="flex gap-2 flex-none">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => void handleClone()}
              disabled={cloning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {cloning ? 'Cloning...' : 'Clone to My Variables'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function LibraryVariablesPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CatalogEntry | null>(null)
  const [copiedRow, setCopiedRow] = useState<string | null>(null)
  const [cloningRow, setCloningRow] = useState<string | null>(null)

  const categories = CATEGORY_ORDER.filter((cat) => CATALOG.some((e) => e.category === cat))
  const filtered = filterCatalog(CATALOG, query, activeCategory)
  const hasFilters = query.trim() !== '' || activeCategory !== null

  const groups = CATEGORY_ORDER
    .map((cat) => ({ cat, entries: filtered.filter((e) => e.category === cat) }))
    .filter((g) => g.entries.length > 0)

  const handleCopyRow = (entry: CatalogEntry) => {
    void navigator.clipboard.writeText(`{{ ${entry.placeholder} }}`).then(() => {
      setCopiedRow(entry.placeholder)
      setTimeout(() => setCopiedRow(null), 2000)
    })
  }

  const handleCloneRow = async (entry: CatalogEntry, e: React.MouseEvent) => {
    e.stopPropagation()
    setCloningRow(entry.placeholder)
    try {
      const v = await createUserVariable({
        name: entry.label,
        description: entry.description,
        type: entry.type,
        category: entry.category,
        params: cloneParams(entry.fullSpec),
      })
      navigate(`/my-variables/${v.id}/edit`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clone failed'
      alert(msg.includes('409') || msg.includes('already exists')
        ? `A variable named "${entry.label}" already exists in My Variables. Rename it first.`
        : msg)
    } finally {
      setCloningRow(null)
    }
  }

  return (
    <div className="p-6">
      {selectedEntry && (
        <VariableDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      <div className="flex items-center gap-3 mb-2">
        <Braces className="w-5 h-5 text-blue-400" />
        <h1 className="text-xl font-semibold text-white">Variables</h1>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        {CATALOG.length} built-in functions that generate values at send time.
        Use these in the Variable Builder when editing a log event.
      </p>

      {/* Naming convention callout */}
      <div className="flex gap-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3 mb-5">
        <Info className="w-4 h-4 text-blue-400 flex-none mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-medium text-blue-300">Variables vs. Objects</p>
          <p>
            <span className="text-blue-300 font-medium">Variables</span> generate a fresh random value every time
            a use case runs (a random IP, timestamp, port, hash, ...).{' '}
            <span className="text-slate-200 font-medium">Objects</span> resolve to one value picked from a
            specific list you maintain (e.g. your organization's real hostnames or IPs) - never randomly generated.
          </p>
          <p>
            Variable placeholders always start with <code className="font-mono text-blue-300">_</code> (e.g.{' '}
            <code className="font-mono text-blue-300">{'{{ _ts_rfc5424 }}'}</code>).
            Object placeholders never start with <code className="font-mono">_</code> (e.g.{' '}
            <code className="font-mono text-slate-300">{'{{ target_user }}'}</code>).
          </p>
          <p className="text-slate-400">
            This makes it instantly clear in any template which placeholders are generated at send time
            and which come from My Objects - no documentation needed.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-5 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, type, placeholder or description..."
            className="w-full pl-9 pr-9 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-sm"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500 flex-none">Category:</span>
          <button
            onClick={() => setActiveCategory(null)}
            className={[
              'px-2.5 py-1 rounded text-xs font-medium transition-colors',
              activeCategory === null
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
            ].join(' ')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
              ].join(' ')}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-12 text-center">
          <Braces className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No variables match your filter.</p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setActiveCategory(null) }}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Grouped tables */}
      {groups.length > 0 && (
        <div className="space-y-6">
          {groups.map(({ cat, entries }) => (
            <div key={cat}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
                {cat}
                <span className="ml-2 normal-case font-normal text-slate-600">
                  {entries.length} {entries.length === 1 ? 'function' : 'functions'}
                </span>
              </h2>
              <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                      <th className="pl-4 pr-2 py-3 w-8" />
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium w-64">Placeholder</th>
                      <th className="text-left px-4 py-3 font-medium">Example output</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {entries.map((entry) => {
                      const badgeCls = CATEGORY_BADGE[entry.category] ?? 'bg-slate-700 text-slate-300'
                      const isCopied = copiedRow === entry.placeholder
                      return (
                        <tr
                          key={entry.placeholder}
                          onClick={() => setSelectedEntry(entry)}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        >
                          {/* Icon */}
                          <td className="pl-4 pr-2 py-3 w-8">
                            <span title="Variable - generated at send time">
                              <Braces className="w-3.5 h-3.5 text-blue-400" />
                            </span>
                          </td>

                          {/* Name + description */}
                          <td className="px-4 py-3 w-56">
                            <div className="text-white font-medium">{entry.label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{entry.description}</div>
                          </td>

                          {/* Type badge */}
                          <td className="px-4 py-3 w-32">
                            <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${badgeCls}`}>
                              {entry.type}
                            </span>
                          </td>

                          {/* Placeholder chip */}
                          <td className="px-4 py-3 w-64" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleCopyRow(entry)}
                              title="Copy placeholder to clipboard"
                              className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 transition-colors whitespace-nowrap"
                            >
                              <span>{`{{ ${entry.placeholder} }}`}</span>
                              {isCopied
                                ? <Check className="w-3 h-3 text-green-400 flex-none" />
                                : <Copy className="w-3 h-3 text-slate-500 flex-none" />}
                            </button>
                          </td>

                          {/* Example output */}
                          <td className="px-4 py-3 text-xs font-mono text-green-400 truncate max-w-xs">
                            {entry.example}
                          </td>

                          {/* Clone action */}
                          <td className="px-4 py-3 w-12" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={(e) => void handleCloneRow(entry, e)}
                              disabled={cloningRow === entry.placeholder}
                              title="Clone to My Variables"
                              className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
