import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Shield, Server, Download, Upload, Search, X } from 'lucide-react'
import { dump, load as parseYaml } from 'js-yaml'
import { listDestinations, deleteDestination, createDestination } from '../api/destinations'
import type { DestinationProfile } from '../api/types'

const PROTOCOL_BADGE: Record<string, string> = {
  udp: 'bg-slate-700 text-slate-300',
  tcp: 'bg-blue-900/50 text-blue-300',
  tls: 'bg-green-900/50 text-green-300',
}

function filterItems(items: DestinationProfile[], query: string): DestinationProfile[] {
  const q = query.toLowerCase().trim()
  if (!q) return items
  return items.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.host.toLowerCase().includes(q) ||
      d.protocol.toLowerCase().includes(q),
  )
}

function DestinationDetailModal({
  dest,
  onClose,
}: {
  dest: DestinationProfile
  onClose: () => void
}) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">{dest.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${PROTOCOL_BADGE[dest.protocol] ?? 'bg-slate-700 text-slate-300'}`}>
                {dest.protocol}
              </span>
              {dest.tls_ca_cert && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <Shield className="w-3 h-3" /> Custom CA
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors ml-3 flex-none">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1">Target</p>
            <p className="text-sm font-mono text-slate-300">{dest.host}:{dest.port}</p>
          </div>
          {dest.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{dest.description}</p>
            </div>
          )}
          {dest.tls_ca_cert && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">TLS CA Certificate</p>
              <p className="text-xs text-slate-400 font-mono bg-slate-800 rounded px-3 py-2 break-all line-clamp-3">
                {dest.tls_ca_cert}
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">
            Close
          </button>
          <button
            onClick={() => { navigate(`/destinations/${dest.id}/edit`); onClose() }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DestinationsPage() {
  const [items, setItems] = useState<DestinationProfile[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedDest, setSelectedDest] = useState<DestinationProfile | null>(null)
  const [query, setQuery] = useState('')

  const filtered = filterItems(items, query)
  const hasFilters = query.trim() !== ''

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((i) => i.id)))
  }

  const load = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError(null)
    try {
      const page = await listDestinations(cursor, 20, ['private'])
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items))
      setTotalCount(page.total_count)
      setNextCursor(page.next_cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load destinations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleExport = () => {
    const toExport = selectedIds.size > 0 ? items.filter((i) => selectedIds.has(i.id)) : filtered
    const payload = {
      version: 1,
      type: 'destinations',
      exported_at: new Date().toISOString(),
      items: toExport.map(({ name, description, host, port, protocol, tls_ca_cert }) => ({
        name, description, host, port, protocol, tls_ca_cert,
      })),
    }
    const blob = new Blob([dump(payload, { lineWidth: 120, noRefs: true })], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openlogforge-destinations-${new Date().toISOString().slice(0, 10)}.olf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const data = parseYaml(text) as { type?: string; items?: unknown[] }
      if (!data || data.type !== 'destinations' || !Array.isArray(data.items)) {
        alert('Invalid file: expected a destinations export.')
        return
      }
      let ok = 0, fail = 0
      for (const item of data.items) {
        try {
          await createDestination(item as Parameters<typeof createDestination>[0])
          ok++
        } catch {
          fail++
        }
      }
      await load()
      if (fail > 0) alert(`Imported ${ok} item(s). ${fail} skipped (duplicate or invalid).`)
    } catch {
      alert('Failed to read import file.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete destination "${name}"?`)) return
    setDeleting(id)
    try {
      await deleteDestination(id)
      setItems((prev) => prev.filter((d) => d.id !== id))
      setTotalCount((n) => n - 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6">
      {selectedDest && (
        <DestinationDetailModal dest={selectedDest} onClose={() => setSelectedDest(null)} />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">My Destinations</h1>
          <p className="text-sm text-slate-400 mt-1">{totalCount} total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={items.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export'}
          </button>
          <button
            onClick={() => importRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-md transition-colors disabled:opacity-40"
          >
            <Upload className="w-4 h-4" />
            {importing ? 'Importing...' : 'Import'}
          </button>
          <input ref={importRef} type="file" accept=".olf" className="hidden" onChange={(e) => void handleImportFile(e)} />
          <Link
            to="/destinations/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Destination
          </Link>
        </div>
      </div>

      {items.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, description, host or protocol..."
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
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <p className="mb-3">No destination profiles yet.</p>
          <Link to="/destinations/new" className="text-blue-400 hover:underline text-sm">
            Add your first SIEM destination
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && !error && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-12 text-center">
          <Server className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No destinations match your filter.</p>
          {hasFilters && (
            <button
              onClick={() => setQuery('')}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                <th className="pl-4 pr-2 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                  />
                </th>
                <th className="pr-2 py-3 w-8" />
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Target</th>
                <th className="text-left px-4 py-3 font-medium">Protocol</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((dest) => (
                <tr key={dest.id} onClick={() => setSelectedDest(dest)} className="hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(dest.id)}
                      onChange={() => toggleSelect(dest.id)}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="pr-2 py-3 w-8">
                    <Server className="w-3.5 h-3.5 text-slate-500" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{dest.name}</span>
                      {dest.tls_ca_cert && (
                        <Shield className="w-3.5 h-3.5 text-green-400" aria-label="Custom CA cert" />
                      )}
                    </div>
                    {dest.description && (
                      <div className="text-xs text-slate-400 mt-0.5">{dest.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-300 text-xs">
                    {dest.host}:{dest.port}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${PROTOCOL_BADGE[dest.protocol] ?? 'bg-slate-700 text-slate-300'}`}
                    >
                      {dest.protocol}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/destinations/${dest.id}/edit`}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => void handleDelete(dest.id, dest.name)}
                        disabled={deleting === dest.id}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <div className="mt-4 text-center">
          <button
            onClick={() => void load(nextCursor)}
            disabled={loading}
            className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {loading && items.length === 0 && (
        <div className="text-center py-16 text-slate-500 text-sm">Loading...</div>
      )}
    </div>
  )
}
