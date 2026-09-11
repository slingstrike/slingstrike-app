import { useEffect, useState, useCallback } from 'react'
import { Network, Copy, Trash2, X, Shield, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listDestinations, createDestination, deleteDestination } from '../api/destinations'
import type { DestinationProfile } from '../api/types'

function filterProfiles(
  items: DestinationProfile[],
  query: string,
  activeProtocol: string | null,
): DestinationProfile[] {
  const q = query.toLowerCase().trim()
  return items.filter((p) => {
    if (activeProtocol && p.protocol !== activeProtocol) return false
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description ?? '').toLowerCase().includes(q) ||
      p.host.toLowerCase().includes(q) ||
      p.protocol.toLowerCase().includes(q)
    )
  })
}

const PROTOCOL_BADGE: Record<string, string> = {
  udp: 'bg-slate-700 text-slate-300',
  tcp: 'bg-blue-900/50 text-blue-300',
  tls: 'bg-green-900/50 text-green-300',
}

function SiemProfileModal({
  profile,
  onClose,
  onClone,
  cloning,
}: {
  profile: DestinationProfile
  onClose: () => void
  onClone: (profile: DestinationProfile) => void
  cloning: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const protocolCls = PROTOCOL_BADGE[profile.protocol] ?? 'bg-slate-700 text-slate-300'

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
            <h2 className="text-white font-semibold text-base">{profile.name}</h2>
            <span
              className={`mt-1 inline-block px-2 py-0.5 text-xs rounded font-mono uppercase ${protocolCls}`}
            >
              {profile.protocol}
            </span>
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
          {profile.description && (
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1">Description</p>
              <p className="text-sm text-slate-300">{profile.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">Endpoint</p>
            <p className="text-sm font-mono text-slate-300 bg-slate-800 border border-slate-700 rounded px-3 py-2">
              {profile.host}:{profile.port}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">Protocol</p>
            <span className={`px-2 py-0.5 text-xs rounded font-mono uppercase ${protocolCls}`}>
              {profile.protocol}
            </span>
          </div>

          <div>
            <p className="text-xs text-slate-500 font-medium mb-1.5">TLS CA Certificate</p>
            {profile.tls_ca_cert ? (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <Shield className="w-4 h-4 flex-none" />
                <span>Custom CA certificate configured</span>
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">None - using system trust store</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Clone to update host and port for your environment.
          </p>
          <div className="flex gap-2 flex-none">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onClone(profile)}
              disabled={cloning}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              {cloning ? 'Cloning...' : 'Clone to My Destinations'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LibrarySiemProfilesPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<DestinationProfile[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cloning, setCloning] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<DestinationProfile | null>(null)
  const [query, setQuery] = useState('')
  const [activeProtocol, setActiveProtocol] = useState<string | null>(null)

  const load = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError(null)
    try {
      const page = await listDestinations(cursor, 20, ['public_readonly'])
      setItems((prev) => (cursor ? [...prev, ...page.items] : page.items))
      setTotalCount(page.total_count)
      setNextCursor(page.next_cursor)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load SIEM profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleClone = useCallback(async (profile: DestinationProfile) => {
    setCloning(profile.id)
    try {
      await createDestination({
        name: `${profile.name} (copy)`,
        description: profile.description,
        host: profile.host,
        port: profile.port,
        protocol: profile.protocol,
        tls_ca_cert: profile.tls_ca_cert,
      })
      setSelectedProfile(null)
      navigate('/destinations')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Clone failed'
      alert(msg.includes('409') || msg.includes('already exists')
        ? `A destination named "${profile.name} (copy)" already exists. Rename it first.`
        : msg)
    } finally {
      setCloning(null)
    }
  }, [navigate])

  const handleDelete = async (profile: DestinationProfile) => {
    if (!confirm(`Delete "${profile.name}" from the SIEM profiles library?`)) return
    setDeleting(profile.id)
    try {
      await deleteDestination(profile.id)
      setItems((prev) => prev.filter((p) => p.id !== profile.id))
      setTotalCount((n) => n - 1)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }

  const filtered = filterProfiles(items, query, activeProtocol)
  const hasFilters = query.trim() !== '' || activeProtocol !== null

  return (
    <div className="p-6">
      {selectedProfile && (
        <SiemProfileModal
          profile={selectedProfile}
          onClose={() => setSelectedProfile(null)}
          onClone={(p) => void handleClone(p)}
          cloning={cloning === selectedProfile.id}
        />
      )}

      <div className="flex items-center gap-3 mb-2">
        <Network className="w-5 h-5 text-blue-400" />
        <h1 className="text-xl font-semibold text-white">SIEM Profiles</h1>
      </div>
      <p className="text-slate-400 text-sm mb-5">
        {totalCount} community destination profiles. Clone any profile into My Destinations and
        update the host and port for your environment.
      </p>

      {items.length > 0 && (
        <div className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name, description or host..."
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
            <span className="text-xs text-slate-500 flex-none">Protocol:</span>
            <button
              onClick={() => setActiveProtocol(null)}
              className={[
                'px-2.5 py-1 rounded text-xs font-medium transition-colors',
                activeProtocol === null
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
              ].join(' ')}
            >
              All
            </button>
            {[...new Set(items.map((p) => p.protocol))].sort().map((proto) => (
              <button
                key={proto}
                onClick={() => setActiveProtocol(activeProtocol === proto ? null : proto)}
                className={[
                  'px-2.5 py-1 rounded text-xs font-medium uppercase transition-colors',
                  activeProtocol === proto
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200',
                ].join(' ')}
              >
                {proto}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-12 text-center">
          <Network className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No SIEM profiles found.</p>
        </div>
      )}

      {!loading && filtered.length === 0 && items.length > 0 && (
        <div className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-12 text-center">
          <Network className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No profiles match your filter.</p>
          {hasFilters && (
            <button
              onClick={() => { setQuery(''); setActiveProtocol(null) }}
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
                <th className="text-left px-4 py-3 font-medium">Protocol</th>
                <th className="text-left px-4 py-3 font-medium">Endpoint</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((profile) => (
                <tr
                  key={profile.id}
                  onClick={() => setSelectedProfile(profile)}
                  className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                >
                  <td className="pl-4 pr-2 py-3 w-8">
                    <Network className="w-3.5 h-3.5 text-slate-500" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{profile.name}</div>
                    {profile.description && (
                      <div className="text-xs text-slate-400 mt-0.5 max-w-sm">
                        {profile.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-1.5 py-0.5 text-xs rounded font-mono uppercase ${PROTOCOL_BADGE[profile.protocol] ?? 'bg-slate-700 text-slate-300'}`}
                    >
                      {profile.protocol}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">
                    {profile.host}:{profile.port}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => void handleClone(profile)}
                        disabled={cloning === profile.id}
                        title="Clone to My Destinations"
                        className="p-1.5 text-slate-400 hover:text-green-400 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => void handleDelete(profile)}
                        disabled={deleting === profile.id}
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
