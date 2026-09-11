import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, ChevronRight, AlertTriangle, Play, CheckCircle, FileText, Download, Upload, Search, X } from 'lucide-react'
import { dump, load as parseYaml } from 'js-yaml'
import { listUseCases, deleteUseCase, sendUseCase, createUseCase } from '../api/useCases'
import type { UseCase } from '../api/types'

const FORMAT_LABELS: Record<string, string> = {
  syslog_rfc3164: 'Syslog RFC3164',
  syslog_rfc5424: 'Syslog RFC5424',
  cef: 'CEF',
  leef: 'LEEF',
  json: 'JSON',
  windows_evtxml: 'Windows EvtXML',
  custom: 'Custom',
}

function filterItems(
  items: UseCase[],
  query: string,
  activeTag: string | null,
  placeholderFilter: string | null,
): UseCase[] {
  const q = query.toLowerCase().trim()
  return items.filter((uc) => {
    // Mirrors the backend's usage-count scan (CAST(log_events AS TEXT) LIKE
    // '%placeholder%') so "N use cases" links from My Variables/My Objects
    // land on exactly the use cases that were counted.
    if (placeholderFilter && !JSON.stringify(uc.log_events).includes(placeholderFilter)) return false
    if (activeTag && !uc.tags.includes(activeTag)) return false
    if (!q) return true
    return (
      uc.name.toLowerCase().includes(q) ||
      uc.description.toLowerCase().includes(q) ||
      uc.tags.some((t) => t.toLowerCase().includes(q)) ||
      uc.mitre_tactics.some((t) => t.toLowerCase().includes(q)) ||
      uc.mitre_techniques.some((t) => t.toLowerCase().includes(q))
    )
  })
}

function UseCaseDetailModal({
  uc,
  onClose,
}: {
  uc: UseCase
  onClose: () => void
}) {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const format = uc.log_events[0]
    ? (FORMAT_LABELS[uc.log_events[0].format] ?? uc.log_events[0].format)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">{uc.name}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {format && (
                <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded">{format}</span>
              )}
              {uc.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded">{tag}</span>
              ))}
              {uc.tags.length > 3 && (
                <span className="text-xs text-slate-500">+{uc.tags.length - 3}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors ml-3 flex-none">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {uc.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{uc.description}</p>
            </div>
          )}
          {uc.mitre_tactics.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">MITRE Tactics</p>
              <div className="flex flex-wrap gap-1.5">
                {uc.mitre_tactics.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-orange-900/50 text-orange-300 text-xs rounded">{t}</span>
                ))}
              </div>
            </div>
          )}
          {uc.mitre_techniques.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">MITRE Techniques</p>
              <div className="flex flex-wrap gap-1.5">
                {uc.mitre_techniques.map((t) => (
                  <span key={t} className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs font-mono rounded">{t}</span>
                ))}
              </div>
            </div>
          )}
          {uc.log_events.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Log blocks</p>
              <p className="text-sm text-slate-300">{uc.log_events.length} {uc.log_events.length === 1 ? 'log block' : 'log blocks'}</p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">
            Close
          </button>
          <button
            onClick={() => { navigate(`/use-cases/${uc.id}/edit`); onClose() }}
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

export default function UseCasesPage() {
  const [items, setItems] = useState<UseCase[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [playResult, setPlayResult] = useState<{ id: number; bytes: number } | null>(null)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedUc, setSelectedUc] = useState<UseCase | null>(null)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const placeholderFilter = searchParams.get('object') ?? searchParams.get('variable')

  const clearPlaceholderFilter = () =>
    setSearchParams((prev) => {
      prev.delete('object')
      prev.delete('variable')
      return prev
    })

  const allTags = [...new Set(items.flatMap((uc) => uc.tags))].sort()
  const filtered = filterItems(items, query, activeTag, placeholderFilter)
  const hasFilters = query.trim() !== '' || activeTag !== null || placeholderFilter !== null

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
      const page = await listUseCases(cursor, 20, ['private', 'public_collaborative'])
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items))
      setTotalCount(page.total_count)
      setNextCursor(page.next_cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load use cases')
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
      type: 'use_cases',
      exported_at: new Date().toISOString(),
      items: toExport.map(({ name, description, visibility, created_by, log_events, mitre_tactics, mitre_techniques, tags }) => ({
        name, description, visibility, created_by, log_events, mitre_tactics, mitre_techniques, tags,
      })),
    }
    // lineWidth: -1 disables width tracking so js-yaml keeps multi-line templates in
    // literal block style (|) instead of folded (>), which would otherwise wrap long
    // lines and insert a blank line for every real newline in the template.
    const blob = new Blob([dump(payload, { lineWidth: -1, noRefs: true })], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openlogforge-use-cases-${new Date().toISOString().slice(0, 10)}.olf`
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
      if (!data || data.type !== 'use_cases' || !Array.isArray(data.items)) {
        alert('Invalid file: expected a use_cases export.')
        return
      }
      let ok = 0, fail = 0
      for (const item of data.items) {
        try {
          await createUseCase(item as Parameters<typeof createUseCase>[0])
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

  const handlePlay = async (uc: (typeof items)[number]) => {
    const destId = parseInt(uc.target_ids[0])
    setPlaying(uc.id)
    setPlayResult(null)
    try {
      const res = await sendUseCase(uc.id, destId)
      setPlayResult({ id: uc.id, bytes: res.bytes_sent })
      setTimeout(() => setPlayResult((prev) => (prev?.id === uc.id ? null : prev)), 3000)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setPlaying(null)
    }
  }

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete use case "${name}"?`)) return
    setDeleting(id)
    try {
      await deleteUseCase(id)
      setItems((prev) => prev.filter((uc) => uc.id !== id))
      setTotalCount((n) => n - 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-6">
      {selectedUc && (
        <UseCaseDetailModal uc={selectedUc} onClose={() => setSelectedUc(null)} />
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Use Cases</h1>
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
            to="/use-cases/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Use Case
          </Link>
        </div>
      </div>

      {placeholderFilter && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-900/30 border border-blue-800/60 rounded-md text-sm">
          <span className="text-blue-300">
            Showing use cases referencing <code className="font-mono">{`{{ ${placeholderFilter} }}`}</code>
          </span>
          <button
            onClick={clearPlaceholderFilter}
            className="ml-auto flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, description, tag or MITRE ID..."
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

          {allTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 flex-none">Tag:</span>
              <button
                onClick={() => setActiveTag(null)}
                className={[
                  'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                  activeTag === null
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
                ].join(' ')}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={[
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    activeTag === tag
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
                  ].join(' ')}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="text-center py-16 text-slate-500">
          <p className="mb-3">No use cases yet.</p>
          <Link to="/use-cases/new" className="text-blue-400 hover:underline text-sm">
            Create your first use case
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && !error && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-12 text-center">
          <FileText className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No use cases match your filter.</p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setActiveTag(null); clearPlaceholderFilter() }}
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
                <th className="text-left px-4 py-3 font-medium">Format</th>
                <th className="text-left px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((uc) => (
                <tr key={uc.id} onClick={() => setSelectedUc(uc)} className="hover:bg-slate-800/50 transition-colors cursor-pointer">
                  <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(uc.id)}
                      onChange={() => toggleSelect(uc.id)}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                    />
                  </td>
                  <td className="pr-2 py-3 w-8">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{uc.name}</span>
                      {uc.target_ids.length === 0 && (
                        <span title="No destination configured - use case cannot be run">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-none" />
                        </span>
                      )}
                    </div>
                    {uc.description && (
                      <div className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">
                        {uc.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-300">
                    {uc.log_events[0]
                      ? (FORMAT_LABELS[uc.log_events[0].format] ?? uc.log_events[0].format)
                      : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {uc.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {uc.tags.length > 3 && (
                        <span className="text-xs text-slate-500">+{uc.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {playResult?.id === uc.id ? (
                        <span className="flex items-center gap-1 text-xs text-green-400 px-2">
                          <CheckCircle className="w-3.5 h-3.5" />
                          {playResult.bytes}B sent
                        </span>
                      ) : (
                        <button
                          onClick={() => void handlePlay(uc)}
                          disabled={playing === uc.id || uc.target_ids.length === 0}
                          title={uc.target_ids.length === 0 ? 'No destination configured' : 'Run'}
                          className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Play className="w-4 h-4" />
                        </button>
                      )}
                      <Link
                        to={`/use-cases/${uc.id}/edit`}
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => void handleDelete(uc.id, uc.name)}
                        disabled={deleting === uc.id}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <Link
                        to={`/use-cases/${uc.id}/edit`}
                        className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
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
