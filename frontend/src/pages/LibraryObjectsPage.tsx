import { useEffect, useCallback, useState } from 'react'
import { Check, Copy, Info, Package, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createObject, listObjects } from '../api/objects'
import type { ObjectGroup } from '../api/types'

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

function filterObjects(
  objects: ObjectGroup[],
  query: string,
  activeCategory: string | null,
): ObjectGroup[] {
  const q = query.toLowerCase().trim()
  return objects.filter((obj) => {
    if (activeCategory && obj.category !== activeCategory) return false
    if (!q) return true
    return (
      obj.name.toLowerCase().includes(q) ||
      obj.placeholder.toLowerCase().includes(q) ||
      obj.description.toLowerCase().includes(q) ||
      obj.values.some((v) => v.toLowerCase().includes(q))
    )
  })
}

function ObjectDetailModal({
  obj,
  onClose,
  onClone,
  cloning,
}: {
  obj: ObjectGroup
  onClose: () => void
  onClone: (obj: ObjectGroup) => void
  cloning: boolean
}) {
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
          <div>
            <h2 className="text-white font-semibold text-base">{obj.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {obj.category && (
                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                  {obj.category}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                {badge.label}
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
          {/* Placeholder */}
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

          {/* Description */}
          {obj.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{obj.description}</p>
            </div>
          )}

          {/* Values */}
          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">
              Sample values
              <span className="ml-1.5 text-slate-600 font-normal">({obj.values.length})</span>
            </p>
            {obj.values.length === 0 ? (
              <p className="text-xs text-slate-600 italic">No sample values defined.</p>
            ) : (
              <ul className="space-y-1">
                {obj.values.map((v, i) => (
                  <li
                    key={i}
                    className="text-xs font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5"
                  >
                    {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Clone to edit values for your environment.
          </p>
          <div className="flex gap-2 flex-none">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onClone(obj)}
              disabled={cloning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {cloning ? 'Cloning...' : 'Clone to My Objects'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LibraryObjectsPage() {
  const navigate = useNavigate()
  const [objects, setObjects] = useState<ObjectGroup[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [cloning, setCloning] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [selectedObj, setSelectedObj] = useState<ObjectGroup | null>(null)

  useEffect(() => {
    void listObjects(undefined, 200)
      .then((page) => {
        setObjects(page.items)
        setTotalCount(page.total_count)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load objects'))
      .finally(() => setLoading(false))
  }, [])

  const handleClone = useCallback(async (obj: ObjectGroup) => {
    setCloning(obj.id)
    try {
      const created = await createObject({
        name: `${obj.name} (copy)`,
        description: obj.description,
        type: obj.type,
        category: '',
        values: obj.values,
      })
      setSelectedObj(null)
      navigate(`/my-objects/${created.id}/edit`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Clone failed'
      alert(msg.includes('409') || msg.includes('already exists')
        ? `An object named "${obj.name} (copy)" already exists in My Objects. Rename it first.`
        : msg)
    } finally {
      setCloning(null)
    }
  }, [navigate])

  const handleCopy = (obj: ObjectGroup) => {
    void navigator.clipboard.writeText(`{{ ${obj.placeholder} }}`).then(() => {
      setCopied(obj.id)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const libraryObjects = objects.filter((o) => o.category !== '')
  const categories = CATEGORY_ORDER.filter((cat) => libraryObjects.some((o) => o.category === cat))
  const filtered = filterObjects(libraryObjects, query, activeCategory)
  const groups = groupByCategory(filtered)
  const hasFilters = query.trim() !== '' || activeCategory !== null

  return (
    <div className="p-6">
      {selectedObj && (
        <ObjectDetailModal
          obj={selectedObj}
          onClose={() => setSelectedObj(null)}
          onClone={(obj) => void handleClone(obj)}
          cloning={cloning === selectedObj.id}
        />
      )}
      <div className="flex items-center gap-3 mb-2">
        <Package className="w-5 h-5 text-blue-400" />
        <h1 className="text-xl font-semibold text-white">Object Library</h1>
      </div>
      <p className="text-slate-400 text-sm mb-4">
        {totalCount} objects available as template placeholders. Click any placeholder chip to copy it,
        then paste it directly into a log template.
      </p>

      {/* Naming convention callout */}
      <div className="flex gap-3 bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3 mb-5">
        <Info className="w-4 h-4 text-blue-400 flex-none mt-0.5" />
        <div className="text-xs text-slate-300 space-y-1">
          <p className="font-medium text-blue-300">Objects vs. Variables</p>
          <p>
            <span className="text-slate-200 font-medium">Objects</span> resolve to one value picked from a
            specific list you maintain (e.g. your organization's real hostnames or IPs) - never randomly
            generated.{' '}
            <span className="text-blue-300 font-medium">Variables</span> generate a fresh random value every
            time a use case runs (a random IP, timestamp, port, hash, ...).
          </p>
          <p>
            Object placeholders never start with <code className="font-mono">_</code> (e.g.{' '}
            <code className="font-mono text-slate-300">{'{{ target_user }}'}</code>).
            Variable placeholders always start with <code className="font-mono text-blue-300">_</code> (e.g.{' '}
            <code className="font-mono text-blue-300">{'{{ _ts_rfc5424 }}'}</code>).
          </p>
          <p className="text-slate-400">
            This makes it instantly clear in any template which placeholders come from My Objects
            and which are generated at send time - no documentation needed.
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
          <Package className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {hasFilters ? 'No objects match your filter.' : 'No objects found.'}
          </p>
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

      {groups.length > 0 && (
        <div className="space-y-6">
          {groups.map(([cat, objs]) => (
            <div key={cat || '_uncategorized'}>
              {cat && (
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 px-1">
                  {cat}
                  <span className="ml-2 normal-case font-normal text-slate-600">
                    {objs.length} {objs.length === 1 ? 'object' : 'objects'}
                  </span>
                </h2>
              )}
              <div className="bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400 text-xs uppercase tracking-wide">
                      <th className="pl-4 pr-2 py-3 w-8" />
                      <th className="text-left px-4 py-3 font-medium">Name</th>
                      <th className="text-left px-4 py-3 font-medium">Type</th>
                      <th className="text-left px-4 py-3 font-medium w-72">Placeholder</th>
                      <th className="text-left px-4 py-3 font-medium">Sample values</th>
                      <th className="px-4 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {objs.map((obj) => {
                      const badge = TYPE_BADGE[obj.type] ?? TYPE_BADGE.string
                      const isCopied = copied === obj.id
                      return (
                        <tr
                          key={obj.id}
                          onClick={() => setSelectedObj(obj)}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                        >
                          <td className="pl-4 pr-2 py-3 w-8">
                            <span title="Object - value list from My Objects">
                              <Package className="w-3.5 h-3.5 text-slate-500" />
                            </span>
                          </td>
                          <td className="px-4 py-3 w-52">
                            <div className="text-white font-medium">{obj.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{obj.description}</div>
                          </td>
                          <td className="px-4 py-3 w-28">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 w-72" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleCopy(obj)}
                              title="Copy placeholder to clipboard"
                              className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded text-xs font-mono text-slate-300 transition-colors whitespace-nowrap"
                            >
                              <span>{`{{ ${obj.placeholder} }}`}</span>
                              {isCopied ? (
                                <Check className="w-3 h-3 text-green-400 flex-none" />
                              ) : (
                                <Copy className="w-3 h-3 text-slate-500 flex-none" />
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {obj.values.slice(0, 3).join(', ')}
                            {obj.values.length > 3 && (
                              <span className="text-slate-600"> +{obj.values.length - 3} more</span>
                            )}
                          </td>
                          <td className="px-4 py-3 w-12" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => void handleClone(obj)}
                              disabled={cloning === obj.id}
                              title="Clone to My Objects"
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
