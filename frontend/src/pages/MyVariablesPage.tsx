import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Braces, Check, Copy, Download, Edit2, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { dump, load } from 'js-yaml'
import { createUserVariable, deleteUserVariable, listUserVariables } from '../api/userVariables'
import type { UserVariable } from '../api/types'
import CreateVariableModal from '../features/variables/CreateVariableModal'

const TYPE_BADGE: Record<string, string> = {
  timestamp:   'bg-rose-900/60 text-rose-300',
  ipv4:        'bg-blue-900/60 text-blue-300',
  port:        'bg-blue-900/60 text-blue-300',
  mac_address: 'bg-blue-900/60 text-blue-300',
  hostname:    'bg-blue-900/60 text-blue-300',
  username:    'bg-green-900/60 text-green-300',
  uuid:        'bg-purple-900/60 text-purple-300',
  integer:     'bg-amber-900/60 text-amber-300',
  hash:        'bg-slate-700 text-slate-300',
}

const CATEGORY_ORDER = ['Time', 'Network', 'Identity', 'Unique IDs', 'Numeric', 'Cryptographic']

function groupByCategory(vars: UserVariable[]): [string, UserVariable[]][] {
  const map = new Map<string, UserVariable[]>()
  for (const v of vars) {
    const cat = v.category || ''
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(v)
  }
  const ordered: [string, UserVariable[]][] = []
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) ordered.push([cat, map.get(cat)!])
  }
  for (const [cat, items] of map) {
    if (!CATEGORY_ORDER.includes(cat)) ordered.push([cat, items])
  }
  return ordered
}

function filterVars(vars: UserVariable[], query: string, activeCategory: string | null): UserVariable[] {
  const q = query.toLowerCase().trim()
  return vars.filter((v) => {
    if (activeCategory !== null && (v.category || '') !== activeCategory) return false
    if (!q) return true
    return (
      v.name.toLowerCase().includes(q) ||
      v.placeholder.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q)
    )
  })
}

function VariableDetailModal({
  v,
  onClose,
}: {
  v: UserVariable
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [modalCopied, setModalCopied] = useState(false)
  const badgeCls = TYPE_BADGE[v.type] ?? 'bg-slate-700 text-slate-300'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCopy = () => {
    void navigator.clipboard.writeText(`{{ ${v.placeholder} }}`).then(() => {
      setModalCopied(true)
      setTimeout(() => setModalCopied(false), 2000)
    })
  }

  const paramEntries = Object.entries(v.params)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">{v.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {v.category && (
                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{v.category}</span>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${badgeCls}`}>{v.type}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors ml-3 flex-none">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">Placeholder</p>
            <button
              onClick={handleCopy}
              title="Copy to clipboard"
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-sm font-mono text-slate-300 transition-colors"
            >
              <span>{`{{ ${v.placeholder} }}`}</span>
              {modalCopied ? (
                <Check className="w-3.5 h-3.5 text-green-400 flex-none" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500 flex-none" />
              )}
            </button>
          </div>
          {v.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{v.description}</p>
            </div>
          )}
          {paramEntries.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1.5">Parameters</p>
              <dl className="space-y-1">
                {paramEntries.map(([key, val]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <dt className="text-slate-500 font-mono flex-none">{key}:</dt>
                    <dd className="text-slate-300 font-mono">{String(val)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">
            Close
          </button>
          <button
            onClick={() => { navigate(`/my-variables/${v.id}/edit`); onClose() }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MyVariablesPage() {
  const navigate = useNavigate()
  const [vars, setVars] = useState<UserVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedVar, setSelectedVar] = useState<UserVariable | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((v) => v.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  useEffect(() => {
    void listUserVariables()
      .then((page) => setVars(page.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load variables'))
      .finally(() => setLoading(false))
  }, [])

  const handleExport = () => {
    const toExport = selectedIds.size > 0 ? vars.filter((v) => selectedIds.has(v.id)) : vars
    const payload = {
      version: 1,
      type: 'variables',
      exported_at: new Date().toISOString(),
      items: toExport.map(({ name, description, type, category, params }) => ({
        name, description, type, category, params,
      })),
    }
    const blob = new Blob([dump(payload, { lineWidth: 120, noRefs: true })], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openlogforge-variables-${new Date().toISOString().slice(0, 10)}.olf`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const data = load(text) as { type?: string; items?: unknown[] }
      if (!data || data.type !== 'variables' || !Array.isArray(data.items)) {
        alert('Invalid file: expected a variables export.')
        return
      }
      let ok = 0, fail = 0
      for (const item of data.items) {
        try {
          await createUserVariable(item as Parameters<typeof createUserVariable>[0])
          ok++
        } catch {
          fail++
        }
      }
      const page = await listUserVariables()
      setVars(page.items)
      if (fail > 0) alert(`Imported ${ok} item(s). ${fail} skipped (duplicate or invalid).`)
    } catch {
      alert('Failed to read import file.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleCopy = (v: UserVariable) => {
    void navigator.clipboard.writeText(`{{ ${v.placeholder} }}`).then(() => {
      setCopied(v.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const handleDelete = async (v: UserVariable) => {
    if (!confirm(`Delete "${v.name}"? This cannot be undone.`)) return
    setDeleting(v.id)
    try {
      await deleteUserVariable(v.id)
      setVars((prev) => prev.filter((x) => x.id !== v.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const presentCategories = new Set(vars.map((v) => v.category).filter(Boolean))
  const categories = [
    ...CATEGORY_ORDER.filter((cat) => presentCategories.has(cat)),
    ...[...presentCategories].filter((cat) => !CATEGORY_ORDER.includes(cat)).sort(),
  ]
  const hasCustom = vars.some((v) => !v.category)
  const categoryChips = [...categories, ...(hasCustom ? [''] : [])]
  const filtered = filterVars(vars, query, activeCategory)
  const groups = groupByCategory(filtered)
  const hasFilters = query.trim() !== '' || activeCategory !== null

  return (
    <div className="p-6">
      {selectedVar && (
        <VariableDetailModal v={selectedVar} onClose={() => setSelectedVar(null)} />
      )}
      {showCreateModal && (
        <CreateVariableModal
          existingCategories={vars.map((v) => v.category)}
          onClose={() => setShowCreateModal(false)}
          onCreated={(v) => {
            setVars((prev) => [...prev, v])
            setShowCreateModal(false)
          }}
        />
      )}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <Braces className="w-5 h-5 text-blue-400" />
          <h1 className="text-xl font-semibold text-white">My Variables</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={vars.length === 0}
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
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Variable
          </button>
        </div>
      </div>

      {vars.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, placeholder, description or type..."
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
          {categoryChips.length > 0 && (
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
              {categoryChips.map((cat) => (
                <button
                  key={cat || '_none'}
                  onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                  className={[
                    'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                    activeCategory === cat
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
                  ].join(' ')}
                >
                  {cat || 'Uncategorized'}
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

      {loading ? (
        <p className="text-slate-400 text-sm">Loading...</p>
      ) : vars.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Braces className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-sm">No variables yet.</p>
          <p className="text-xs mt-1">
            Create pre-configured variable presets or clone them from Library - Variables.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-sm">No variables match your filter.</p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setActiveCategory(null) }}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wider">
                <th className="pl-4 pr-2 py-3 w-10">
                  {(() => {
                    const visibleIds = filtered.map((v) => v.id)
                    return (
                      <input
                        type="checkbox"
                        checked={visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))}
                        ref={(el) => { if (el) el.indeterminate = visibleIds.some((id) => selectedIds.has(id)) && !visibleIds.every((id) => selectedIds.has(id)) }}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                      />
                    )
                  })()}
                </th>
                <th className="pr-2 py-3 w-8" />
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Placeholder</th>
                <th className="text-left px-4 py-3 font-medium">Used in</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {groups.map(([cat, items]) => (
                <>
                  {cat && (
                    <tr key={`cat-${cat}`}>
                      <td
                        colSpan={8}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-800/60 border-b border-slate-700/60"
                      >
                        {cat}
                      </td>
                    </tr>
                  )}
                  {items.map((v) => {
                    const badgeCls = TYPE_BADGE[v.type] ?? 'bg-slate-700 text-slate-300'
                    const isCopied = copied === v.id
                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelectedVar(v)}
                        className="border-b border-slate-700/50 last:border-0 hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(v.id)}
                            onChange={() => toggleSelect(v.id)}
                            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="pr-2 py-3 w-8">
                          <span title="Variable - generated at send time">
                            <Braces className="w-3.5 h-3.5 text-blue-400" />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{v.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${badgeCls}`}>
                            {v.type}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleCopy(v)}
                            title="Copy to clipboard"
                            className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 transition-colors"
                          >
                            <span>{`{{ ${v.placeholder} }}`}</span>
                            {isCopied
                              ? <Check className="w-3 h-3 text-green-400 flex-none" />
                              : <Copy className="w-3 h-3 text-slate-500 flex-none" />}
                          </button>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {v.usage_count > 0 ? (
                            <button
                              onClick={() => navigate(`/use-cases?variable=${encodeURIComponent(v.placeholder)}`)}
                              className="px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 transition-colors"
                              title="View use cases using this placeholder"
                            >
                              {v.usage_count} use {v.usage_count === 1 ? 'case' : 'cases'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">unused</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                          {v.description || '-'}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => navigate(`/my-variables/${v.id}/edit`)}
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleDelete(v)}
                              disabled={deleting === v.id}
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
