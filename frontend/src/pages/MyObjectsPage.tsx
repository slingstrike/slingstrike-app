import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy, Download, Edit2, Package, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import { dump, load } from 'js-yaml'
import { createObject, deleteObject, listObjects } from '../api/objects'
import type { ObjectGroup } from '../api/types'
import CreateObjectModal from '../features/objects/CreateObjectModal'

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  ipv4:      { label: 'IPv4',      cls: 'bg-blue-900/60 text-blue-300' },
  ipv6:      { label: 'IPv6',      cls: 'bg-blue-900/60 text-blue-300' },
  hostname:  { label: 'Hostname',  cls: 'bg-purple-900/60 text-purple-300' },
  username:  { label: 'Username',  cls: 'bg-green-900/60 text-green-300' },
  port:      { label: 'Port',      cls: 'bg-amber-900/60 text-amber-300' },
  filepath:  { label: 'File Path', cls: 'bg-orange-900/60 text-orange-300' },
  url:       { label: 'URL',       cls: 'bg-cyan-900/60 text-cyan-300' },
  string:    { label: 'String',    cls: 'bg-slate-700 text-slate-300' },
}

const CATEGORY_ORDER = ['General', 'Endpoint', 'Identity', 'Network', 'File System', 'Web', 'Windows', 'Cloud']

function filterObjects(
  objects: ObjectGroup[],
  query: string,
  activeCategory: string | null,
): ObjectGroup[] {
  const q = query.toLowerCase().trim()
  return objects.filter((obj) => {
    if (activeCategory !== null && (obj.category || '') !== activeCategory) return false
    if (!q) return true
    return (
      obj.name.toLowerCase().includes(q) ||
      obj.placeholder.toLowerCase().includes(q) ||
      obj.description.toLowerCase().includes(q) ||
      obj.values.some((v) => v.toLowerCase().includes(q))
    )
  })
}

function groupByCategory(objects: ObjectGroup[]): [string, ObjectGroup[]][] {
  const map = new Map<string, ObjectGroup[]>()
  for (const obj of objects) {
    const cat = obj.category || ''
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(obj)
  }
  const ordered: [string, ObjectGroup[]][] = []
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) ordered.push([cat, map.get(cat)!])
  }
  for (const [cat, objs] of map) {
    if (!CATEGORY_ORDER.includes(cat)) ordered.push([cat, objs])
  }
  return ordered
}

function ObjectDetailModal({
  obj,
  onClose,
}: {
  obj: ObjectGroup
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [modalCopied, setModalCopied] = useState(false)
  const badge = TYPE_BADGE[obj.type] ?? TYPE_BADGE.string

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCopy = () => {
    void navigator.clipboard.writeText(`{{ ${obj.placeholder} }}`).then(() => {
      setModalCopied(true)
      setTimeout(() => setModalCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">{obj.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {obj.category && (
                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{obj.category}</span>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
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
              <span>{`{{ ${obj.placeholder} }}`}</span>
              {modalCopied ? (
                <Check className="w-3.5 h-3.5 text-green-400 flex-none" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500 flex-none" />
              )}
            </button>
          </div>
          {obj.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{obj.description}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">
              Sample values <span className="ml-1.5 text-slate-600 font-normal">({obj.values.length})</span>
            </p>
            {obj.values.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No sample values defined.</p>
            ) : (
              <ul className="space-y-1">
                {obj.values.map((v, i) => (
                  <li key={i} className="text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5">{v}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors">
            Close
          </button>
          <button
            onClick={() => { navigate(`/my-objects/${obj.id}/edit`); onClose() }}
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

export default function MyObjectsPage() {
  const navigate = useNavigate()
  const [objects, setObjects] = useState<ObjectGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedObj, setSelectedObj] = useState<ObjectGroup | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    void listObjects(undefined, 200)
      .then((page) => setObjects(page.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load objects'))
      .finally(() => setLoading(false))
  }, [])

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((o) => o.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const handleExport = () => {
    const toExport = selectedIds.size > 0 ? objects.filter((o) => selectedIds.has(o.id)) : objects
    const payload = {
      version: 1,
      type: 'objects',
      exported_at: new Date().toISOString(),
      items: toExport.map(({ name, description, type, values, category, placeholder }) => ({
        name, description, type, values, category, placeholder,
      })),
    }
    const blob = new Blob([dump(payload, { lineWidth: 120, noRefs: true })], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `openlogforge-objects-${new Date().toISOString().slice(0, 10)}.olf`
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
      if (!data || data.type !== 'objects' || !Array.isArray(data.items)) {
        alert('Invalid file: expected an objects export.')
        return
      }
      let ok = 0, fail = 0
      for (const item of data.items) {
        try {
          await createObject(item as Parameters<typeof createObject>[0])
          ok++
        } catch {
          fail++
        }
      }
      const page = await listObjects(undefined, 200)
      setObjects(page.items)
      if (fail > 0) alert(`Imported ${ok} item(s). ${fail} skipped (duplicate or invalid).`)
    } catch {
      alert('Failed to read import file.')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const handleCopy = (obj: ObjectGroup) => {
    void navigator.clipboard.writeText(`{{ ${obj.placeholder} }}`).then(() => {
      setCopied(obj.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const handleDelete = async (obj: ObjectGroup) => {
    if (!confirm(`Delete "${obj.name}"? This cannot be undone.`)) return
    setDeleting(obj.id)
    try {
      await deleteObject(obj.id)
      setObjects((prev) => prev.filter((o) => o.id !== obj.id))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const presentCategories = new Set(objects.map((o) => o.category).filter(Boolean))
  const allCategories = [
    ...CATEGORY_ORDER.filter((cat) => presentCategories.has(cat)),
    ...[...presentCategories].filter((cat) => !CATEGORY_ORDER.includes(cat)).sort(),
  ]
  const hasCustom = objects.some((o) => !o.category)
  const categoryChips = [
    ...allCategories,
    ...(hasCustom ? [''] : []),
  ]
  const filtered = filterObjects(objects, query, activeCategory)
  const groups = groupByCategory(filtered)
  const hasFilters = query.trim() !== '' || activeCategory !== null

  return (
    <div className="p-6">
      {selectedObj && (
        <ObjectDetailModal obj={selectedObj} onClose={() => setSelectedObj(null)} />
      )}
      {showCreateModal && (
        <CreateObjectModal
          existingCategories={objects.map((o) => o.category ?? '')}
          onClose={() => setShowCreateModal(false)}
          onCreated={(obj) => {
            setObjects((prev) => [...prev, obj])
            setShowCreateModal(false)
          }}
        />
      )}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-white">My Objects</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={objects.length === 0}
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
            New Object
          </button>
        </div>
      </div>

      {objects.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, placeholder, description or value..."
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
      ) : objects.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-sm">No objects yet.</p>
          <p className="text-xs mt-1">
            Create named lists of IPs, hostnames, usernames and more to reuse across use cases.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-sm">No objects match your filter.</p>
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
                    const visibleIds = filtered.map((o) => o.id)
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
                <th className="text-left px-4 py-3 font-medium">Values</th>
                <th className="text-left px-4 py-3 font-medium">Used in</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {groups.map(([cat, objs]) => (
                <>
                  {cat && (
                    <tr key={`cat-${cat}`}>
                      <td
                        colSpan={9}
                        className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-800/60 border-b border-slate-700/60"
                      >
                        {cat}
                      </td>
                    </tr>
                  )}
                  {objs.map((obj) => {
                    const badge = TYPE_BADGE[obj.type] ?? TYPE_BADGE.string
                    const isCopied = copied === obj.id
                    return (
                      <tr
                        key={obj.id}
                        onClick={() => setSelectedObj(obj)}
                        className="border-b border-slate-700/50 last:border-0 hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        <td className="pl-4 pr-2 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(obj.id)}
                            onChange={() => toggleSelect(obj.id)}
                            className="w-4 h-4 rounded accent-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="pr-2 py-3 w-8">
                          <span title="Object - value list">
                            <Package className="w-3.5 h-3.5 text-slate-500" />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white font-medium">{obj.name}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleCopy(obj)}
                            title="Copy to clipboard"
                            className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 transition-colors"
                          >
                            <span>{`{{ ${obj.placeholder} }}`}</span>
                            {isCopied ? (
                              <Check className="w-3 h-3 text-green-400 flex-none" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-500 flex-none" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-slate-400">
                          {obj.values.length} {obj.values.length === 1 ? 'entry' : 'entries'}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          {obj.usage_count > 0 ? (
                            <button
                              onClick={() => navigate(`/use-cases?object=${encodeURIComponent(obj.placeholder)}`)}
                              className="px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 hover:bg-blue-800/60 transition-colors"
                              title="View use cases using this placeholder"
                            >
                              {obj.usage_count} use {obj.usage_count === 1 ? 'case' : 'cases'}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">unused</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                          {obj.description || '-'}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => navigate(`/my-objects/${obj.id}/edit`)}
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleDelete(obj)}
                              disabled={deleting === obj.id}
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
