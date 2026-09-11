import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { createUserVariable } from '../../api/userVariables'
import type { UserVariable } from '../../api/types'
import {
  VARIABLE_TYPES,
  TYPE_DEFAULT_CATEGORY,
  DEFAULT_PARAMS,
  SUGGESTED_VARIABLE_CATEGORIES,
  slugifyVar,
  generatePreview,
} from './variableCatalog'
import CategoryCombobox from '../../components/CategoryCombobox'

interface FormState {
  name: string
  description: string
  type: string
  category: string
  params: Record<string, unknown>
}

export default function CreateVariableModal({
  initialName = '',
  existingCategories = [],
  onClose,
  onCreated,
}: {
  initialName?: string
  existingCategories?: string[]
  onClose: () => void
  onCreated: (variable: UserVariable) => void
}) {
  const categoryOptions = Array.from(
    new Set([...SUGGESTED_VARIABLE_CATEGORIES, ...existingCategories.filter(Boolean)])
  ).sort()
  const [form, setForm] = useState<FormState>({
    name: initialName,
    description: '',
    type: 'timestamp',
    category: 'Time',
    params: { ...DEFAULT_PARAMS['timestamp'] },
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(() => generatePreview('timestamp', DEFAULT_PARAMS['timestamp']))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setParam = (key: string, value: unknown) => {
    setForm((prev) => {
      const params = { ...prev.params, [key]: value }
      setPreview(generatePreview(prev.type, params))
      return { ...prev, params }
    })
  }

  const handleTypeChange = (type: string) => {
    const params = { ...DEFAULT_PARAMS[type] }
    setForm((prev) => ({
      ...prev,
      type,
      category: TYPE_DEFAULT_CATEGORY[type] || prev.category,
      params,
    }))
    setPreview(generatePreview(type, params))
  }

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      const v = await createUserVariable({
        name: form.name,
        description: form.description,
        type: form.type,
        category: form.category,
        params: form.params,
      })
      onCreated(v)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  const currentPlaceholder = form.name ? slugifyVar(form.name) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">New Variable</h2>
            <p className="mt-0.5 text-xs text-slate-500">Generates a fresh random value every time this use case runs</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); void handleSubmit() }}
          className="px-5 py-4 overflow-y-auto flex-1 space-y-4"
        >
          {error && (
            <div className="px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
              <input
                type="text"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
                placeholder="Auth Timestamp"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Type *</label>
              <select
                value={form.type}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:border-blue-500 text-sm"
              >
                {VARIABLE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {currentPlaceholder && (
            <p className="text-xs text-slate-500">
              Placeholder: <code className="font-mono text-blue-300">{`{{ ${currentPlaceholder} }}`}</code>
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="e.g. Timestamp for authentication events"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Category
              <span className="ml-2 text-slate-500 font-normal text-xs">auto-set from type, editable</span>
            </label>
            <CategoryCombobox
              value={form.category}
              onChange={(category) => setForm((prev) => ({ ...prev, category }))}
              options={categoryOptions}
            />
          </div>

          {(form.type === 'timestamp' || form.type === 'port' || form.type === 'ipv4' || form.type === 'integer' || form.type === 'hash') && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Parameters</label>
              <div className="rounded-md border border-slate-700 bg-slate-950 px-4 py-3 space-y-3">

                {form.type === 'timestamp' && (
                  <>
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-slate-400 w-32 flex-none">Format</label>
                      <select
                        value={String(form.params.format ?? 'rfc5424')}
                        onChange={(e) => setParam('format', e.target.value)}
                        className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                      >
                        <option value="rfc5424">ISO 8601 (RFC 5424)</option>
                        <option value="rfc3164">Legacy syslog (RFC 3164)</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-slate-400 w-32 flex-none">Offset (seconds)</label>
                      <input
                        type="number"
                        value={String(form.params.offset_seconds ?? 0)}
                        onChange={(e) => setParam('offset_seconds', Number(e.target.value))}
                        className="w-32 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                        placeholder="0"
                      />
                      <span className="text-xs text-slate-500">negative = past, positive = future</span>
                    </div>
                  </>
                )}

                {form.type === 'ipv4' && (
                  <>
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-slate-400 w-32 flex-none">CIDR subnet</label>
                      <input
                        type="text"
                        value={String(form.params.cidr ?? '')}
                        onChange={(e) => setParam('cidr', e.target.value || undefined)}
                        placeholder="e.g. 192.168.1.0/24 (optional)"
                        className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="text-xs text-slate-400 w-32 flex-none">Range</label>
                      <input
                        type="text"
                        value={String(form.params.range ?? '')}
                        onChange={(e) => setParam('range', e.target.value || undefined)}
                        placeholder="e.g. 10.0.0.1-10.0.0.254 (optional)"
                        className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </>
                )}

                {(form.type === 'port' || form.type === 'integer') && (
                  <div className="flex items-center gap-4">
                    <label className="text-xs text-slate-400 w-32 flex-none">Range</label>
                    <input
                      type="number"
                      value={String(form.params.min ?? (form.type === 'port' ? 1024 : 1000))}
                      onChange={(e) => setParam('min', Number(e.target.value))}
                      className="w-28 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                      placeholder="min"
                    />
                    <span className="text-xs text-slate-500">to</span>
                    <input
                      type="number"
                      value={String(form.params.max ?? (form.type === 'port' ? 65535 : 9999))}
                      onChange={(e) => setParam('max', Number(e.target.value))}
                      className="w-28 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                      placeholder="max"
                    />
                  </div>
                )}

                {form.type === 'hash' && (
                  <div className="flex items-center gap-4">
                    <label className="text-xs text-slate-400 w-32 flex-none">Algorithm</label>
                    <select
                      value={String(form.params.algorithm ?? 'sha256')}
                      onChange={(e) => setParam('algorithm', e.target.value)}
                      className="flex-1 px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="sha256">SHA-256 (64 chars)</option>
                      <option value="sha1">SHA-1 (40 chars)</option>
                      <option value="md5">MD5 (32 chars)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-300">Live preview</label>
              <button
                type="button"
                onClick={() => setPreview(generatePreview(form.type, form.params))}
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
        </form>

        <div className="px-5 py-3 border-t border-slate-700 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving || !form.name}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded transition-colors"
          >
            {saving ? 'Creating...' : 'Create Variable'}
          </button>
        </div>
      </div>
    </div>
  )
}
