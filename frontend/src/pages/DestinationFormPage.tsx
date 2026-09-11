import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { createDestination, getDestination, updateDestination } from '../api/destinations'
import type { Protocol } from '../api/types'

interface FormState {
  name: string
  description: string
  host: string
  port: string
  protocol: Protocol
  tls_ca_cert: string
}

const EMPTY: FormState = {
  name: '',
  description: '',
  host: '',
  port: '514',
  protocol: 'udp',
  tls_ca_cert: '',
}

export default function DestinationFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = id !== undefined
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit) return
    void getDestination(Number(id))
      .then((dest) => {
        setForm({
          name: dest.name,
          description: dest.description,
          host: dest.host,
          port: String(dest.port),
          protocol: dest.protocol,
          tls_ca_cert: dest.tls_ca_cert ?? '',
        })
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load destination')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
    }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const portNum = parseInt(form.port, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Port must be between 1 and 65535')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        host: form.host,
        port: portNum,
        protocol: form.protocol,
        tls_ca_cert: form.tls_ca_cert.trim() || null,
      }
      if (isEdit) {
        await updateDestination(Number(id), payload)
      } else {
        await createDestination(payload)
      }
      navigate('/destinations')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-slate-400 text-sm">Loading...</div>
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/destinations')}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-semibold text-white">
          {isEdit ? 'Edit Destination' : 'New Destination'}
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
            placeholder="QRadar Production"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={set('description')}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="Primary QRadar collector"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1">Host *</label>
            <input
              type="text"
              required
              value={form.host}
              onChange={set('host')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm font-mono"
              placeholder="192.168.1.100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Port *</label>
            <input
              type="number"
              required
              min={1}
              max={65535}
              value={form.port}
              onChange={set('port')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:border-blue-500 text-sm font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Protocol</label>
          <div className="flex gap-3">
            {(['udp', 'tcp', 'tls'] as Protocol[]).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="protocol"
                  value={p}
                  checked={form.protocol === p}
                  onChange={set('protocol')}
                  className="accent-blue-500"
                />
                <span className="text-sm text-slate-300 uppercase font-medium">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {form.protocol === 'tls' && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Custom CA Certificate
              <span className="text-slate-500 font-normal ml-1">(PEM, leave blank for system CA)</span>
            </label>
            <textarea
              value={form.tls_ca_cert}
              onChange={set('tls_ca_cert')}
              rows={6}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-xs font-mono"
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            />
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Destination'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/destinations')}
            className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
