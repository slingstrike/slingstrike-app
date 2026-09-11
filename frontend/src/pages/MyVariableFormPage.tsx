import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, FileText, RefreshCw } from 'lucide-react'
import { createUserVariable, getUserVariable, listUserVariables, updateUserVariable } from '../api/userVariables'
import {
  VARIABLE_TYPES,
  TYPE_DEFAULT_CATEGORY,
  DEFAULT_PARAMS,
  SUGGESTED_VARIABLE_CATEGORIES,
  slugifyVar,
  generatePreview,
} from '../features/variables/variableCatalog'
import CategoryCombobox from '../components/CategoryCombobox'

interface FormState {
  name: string
  description: string
  type: string
  category: string
  params: Record<string, unknown>
}

const EMPTY: FormState = {
  name: '',
  description: '',
  type: 'timestamp',
  category: 'Time',
  params: { ...DEFAULT_PARAMS['timestamp'] },
}

export default function MyVariableFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = id !== undefined
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [form, setForm] = useState<FormState>(() => {
    const prefillName = !isEdit ? searchParams.get('name') : null
    return prefillName ? { ...EMPTY, name: prefillName } : EMPTY
  })
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedPlaceholder, setSavedPlaceholder] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [preview, setPreview] = useState(() => generatePreview('timestamp', DEFAULT_PARAMS['timestamp']))
  const [existingCategories, setExistingCategories] = useState<string[]>([])
  const [usageCount, setUsageCount] = useState(0)

  useEffect(() => {
    void listUserVariables(undefined, 200).then((page) => {
      setExistingCategories(page.items.map((v) => v.category).filter(Boolean))
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    void getUserVariable(Number(id))
      .then((v) => {
        const f: FormState = {
          name: v.name,
          description: v.description,
          type: v.type,
          category: v.category,
          params: v.params,
        }
        setForm(f)
        setSavedPlaceholder(v.placeholder)
        setUsageCount(v.usage_count)
        setPreview(generatePreview(v.type, v.params))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

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

  const handleCopy = () => {
    const ph = savedPlaceholder ?? slugifyVar(form.name)
    void navigator.clipboard.writeText(`{{ ${ph} }}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const buildPayload = () => ({
    name: form.name,
    description: form.description,
    type: form.type,
    category: form.category,
    params: form.params,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await updateUserVariable(Number(id), buildPayload())
      } else {
        await createUserVariable(buildPayload())
      }
      navigate('/my-variables')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleApply = async () => {
    setApplying(true)
    setError(null)
    try {
      if (isEdit) {
        const v = await updateUserVariable(Number(id), buildPayload())
        setSavedPlaceholder(v.placeholder)
      } else {
        const v = await createUserVariable(buildPayload())
        setSavedPlaceholder(v.placeholder)
        navigate(`/my-variables/${v.id}/edit`, { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading...</div>

  const currentPlaceholder = savedPlaceholder ?? (form.name ? slugifyVar(form.name) : null)
  const placeholderStale = savedPlaceholder !== null && form.name !== '' && slugifyVar(form.name) !== savedPlaceholder

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/my-variables')}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-semibold text-white">
          {isEdit ? 'Edit Variable' : 'New Variable'}
        </h1>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        {/* Name + Type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
            <input
              type="text"
              required
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

        {/* Placeholder */}
        {form.name && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Placeholder
              <span className="ml-2 text-slate-500 font-normal text-xs">paste into any log template</span>
            </label>
            <div className="flex items-center gap-2">
              <code
                className={[
                  'flex-1 px-3 py-2 bg-slate-900 border rounded-md text-sm font-mono select-all transition-colors',
                  placeholderStale ? 'border-amber-700/50 text-amber-300' : 'border-slate-600 text-blue-300',
                ].join(' ')}
              >
                {currentPlaceholder ? `{{ ${currentPlaceholder} }}` : ''}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!savedPlaceholder}
                title={!savedPlaceholder ? 'Save first to copy' : 'Copy to clipboard'}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600 rounded-md text-sm text-slate-300 transition-colors"
              >
                {copied
                  ? <><Check className="w-4 h-4 text-green-400" /> Copied</>
                  : <><Copy className="w-4 h-4" /> Copy</>}
              </button>
            </div>
            {placeholderStale && (
              <p className="mt-1 text-xs text-amber-400/80">
                Placeholder will change to <code className="font-mono">{slugifyVar(form.name)}</code> on save.
              </p>
            )}
            <p className="mt-1.5 flex items-center gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5 text-slate-500 flex-none" />
              {usageCount > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate(`/use-cases?variable=${encodeURIComponent(savedPlaceholder ?? '')}`)}
                  className="text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Used in {usageCount} use {usageCount === 1 ? 'case' : 'cases'}
                </button>
              ) : (
                <span className="text-slate-500">Not used in any use case yet</span>
              )}
            </p>
          </div>
        )}

        {/* Description */}
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

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Category
            <span className="ml-2 text-slate-500 font-normal text-xs">auto-set from type, editable</span>
          </label>
          <CategoryCombobox
            value={form.category}
            onChange={(category) => setForm((prev) => ({ ...prev, category }))}
            options={Array.from(
              new Set([...SUGGESTED_VARIABLE_CATEGORIES, ...existingCategories])
            ).sort()}
          />
        </div>

        {/* Type-specific params */}
        {(form.type === 'timestamp' || form.type === 'port' || form.type === 'ipv4' || form.type === 'integer' || form.type === 'hash') && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Parameters</label>
            <div className="rounded-md border border-slate-700 bg-slate-900 px-4 py-3 space-y-3">

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

        {/* Live preview */}
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
          <code className="block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-green-400 break-all">
            {preview}
          </code>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-44 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Variable'}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying}
              className="w-28 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
            >
              {applying ? 'Applying...' : 'Apply'}
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/my-variables')}
            className="w-28 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
