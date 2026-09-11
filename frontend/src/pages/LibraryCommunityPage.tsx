import { useEffect, useState, useCallback } from 'react'
import { Globe, Copy, Search, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listUseCases, createUseCase, deleteUseCase } from '../api/useCases'
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

function filterItems(items: UseCase[], query: string, activeTag: string | null): UseCase[] {
  const q = query.toLowerCase().trim()
  return items.filter((uc) => {
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

function CommunityPackModal({
  uc,
  onClose,
  onClone,
  cloning,
}: {
  uc: UseCase
  onClose: () => void
  onClone: (uc: UseCase) => void
  cloning: boolean
}) {
  const formats = [...new Set(uc.log_events.map((e) => e.format))]

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
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold text-base pr-3">{uc.name}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors flex-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          {uc.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{uc.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">
              Log format{formats.length > 1 ? 's' : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {formats.map((f) => (
                <span
                  key={f}
                  className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded font-mono"
                >
                  {FORMAT_LABELS[f] ?? f}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-600 mt-1.5">
              {uc.log_events.length} {uc.log_events.length === 1 ? 'log block' : 'log blocks'}
            </p>
          </div>

          {uc.mitre_tactics.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">MITRE Tactics</p>
              <div className="flex flex-wrap gap-1.5">
                {uc.mitre_tactics.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {uc.mitre_techniques.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">MITRE Techniques</p>
              <div className="flex flex-wrap gap-1.5">
                {uc.mitre_techniques.map((t) => (
                  <span
                    key={t}
                    className="px-2 py-0.5 bg-indigo-900/50 text-indigo-300 text-xs rounded font-mono"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {uc.tags.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {uc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-slate-700 text-slate-300 text-xs rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Clone to customise the use case in your workspace.
          </p>
          <div className="flex gap-2 flex-none">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onClone(uc)}
              disabled={cloning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {cloning ? 'Cloning...' : 'Clone to My Use Cases'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LibraryCommunityPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<UseCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cloning, setCloning] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selectedUc, setSelectedUc] = useState<UseCase | null>(null)

  useEffect(() => {
    setLoading(true)
    void listUseCases(undefined, 200, ['public_readonly'])
      .then((page) => setItems(page.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load community use cases'))
      .finally(() => setLoading(false))
  }, [])

  const handleClone = useCallback(async (uc: UseCase) => {
    setCloning(uc.id)
    try {
      await createUseCase({
        name: `${uc.name} (copy)`,
        description: uc.description,
        log_events: uc.log_events,
        tags: uc.tags,
        mitre_tactics: uc.mitre_tactics,
        mitre_techniques: uc.mitre_techniques,
        visibility: 'private',
      })
      setSelectedUc(null)
      navigate('/use-cases')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Clone failed')
    } finally {
      setCloning(null)
    }
  }, [navigate])

  const handleDelete = async (uc: UseCase) => {
    if (!confirm(`Delete "${uc.name}" from the community library?`)) return
    setDeleting(uc.id)
    try {
      await deleteUseCase(uc.id)
      setItems((prev) => prev.filter((item) => item.id !== uc.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const allTags = [...new Set(items.flatMap((uc) => uc.tags))].sort()
  const filtered = filterItems(items, query, activeTag)
  const hasFilters = query.trim() !== '' || activeTag !== null

  return (
    <div className="p-6">
      {selectedUc && (
        <CommunityPackModal
          uc={selectedUc}
          onClose={() => setSelectedUc(null)}
          onClone={(uc) => void handleClone(uc)}
          cloning={cloning === selectedUc.id}
        />
      )}

      <div className="flex items-center gap-3 mb-2">
        <Globe className="w-5 h-5 text-blue-400" />
        <h1 className="text-xl font-semibold text-white">Community Packs</h1>
      </div>
      <p className="text-slate-400 text-sm mb-5">
        {items.length} bundled use cases - free to use, read-only. Clone any use case to your
        workspace to customise it.
      </p>

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

      {loading && (
        <div className="text-center py-16 text-slate-500 text-sm">Loading...</div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-12 text-center">
          <Globe className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {hasFilters ? 'No use cases match your filter.' : 'No community use cases found.'}
          </p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setActiveTag(null) }}
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
                <th className="pl-4 pr-2 py-3 w-8" />
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Format</th>
                <th className="text-left px-4 py-3 font-medium">MITRE Tactics</th>
                <th className="text-left px-4 py-3 font-medium">Tags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((uc) => (
                <tr
                  key={uc.id}
                  onClick={() => setSelectedUc(uc)}
                  className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <td className="pl-4 pr-2 py-3 w-8">
                    <Globe className="w-3.5 h-3.5 text-slate-500" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{uc.name}</div>
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
                      {uc.mitre_tactics.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 bg-blue-900/50 text-blue-300 text-xs rounded font-mono"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
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
                      <button
                        onClick={() => void handleClone(uc)}
                        disabled={cloning === uc.id}
                        title="Clone to My Use Cases"
                        className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(uc)}
                        disabled={deleting === uc.id}
                        title="Delete"
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
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
    </div>
  )
}
