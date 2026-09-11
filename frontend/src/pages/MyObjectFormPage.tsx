import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Copy, FileText } from 'lucide-react'
import { createObject, getObject, listObjects, updateObject } from '../api/objects'
import type { ObjectType } from '../api/types'
import { OBJECT_TYPES, TYPE_HINTS, KNOWN_CATEGORIES, slugifyObj as slugify } from '../features/objects/objectCatalog'
import CategoryCombobox from '../components/CategoryCombobox'

interface FormState {
  name: string
  description: string
  type: ObjectType
  category: string
  valuesText: string
}

const EMPTY: FormState = {
  name: '',
  description: '',
  type: 'ipv4',
  category: '',
  valuesText: '',
}

export default function MyObjectFormPage() {
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
  const [placeholder, setPlaceholder] = useState<string | null>(null)
  const [usageCount, setUsageCount] = useState(0)
  const [copied, setCopied] = useState(false)
  const [existingCategories, setExistingCategories] = useState<string[]>([])

  useEffect(() => {
    void listObjects(undefined, 200).then((page) => {
      setExistingCategories(page.items.map((o) => o.category ?? '').filter(Boolean))
    })
  }, [])

  useEffect(() => {
    if (!isEdit) return
    void getObject(Number(id))
      .then((obj) => {
        setForm({
          name: obj.name,
          description: obj.description,
          type: obj.type,
          category: obj.category ?? '',
          valuesText: obj.values.join('\n'),
        })
        setPlaceholder(obj.placeholder)
        setUsageCount(obj.usage_count)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id, isEdit])

  const handleCopy = () => {
    if (!placeholder) return
    void navigator.clipboard.writeText(`{{ ${placeholder} }}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const parseValues = () =>
    form.valuesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

  const buildPayload = () => ({
    name: form.name,
    description: form.description,
    type: form.type,
    category: form.category,
    values: parseValues(),
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await updateObject(Number(id), buildPayload())
      } else {
        await createObject(buildPayload())
      }
      navigate('/my-objects')
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
        const obj = await updateObject(Number(id), buildPayload())
        setPlaceholder(obj.placeholder)
      } else {
        const obj = await createObject(buildPayload())
        setPlaceholder(obj.placeholder)
        navigate(`/my-objects/${obj.id}/edit`, { replace: true })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setApplying(false)
    }
  }

  if (loading) return <div className="p-6 text-slate-400 text-sm">Loading...</div>

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/my-objects')}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 rounded transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-xl font-semibold text-white">
          {isEdit ? 'Edit Object' : 'New Object'}
        </h1>
      </div>

      {error && (
        <div className="mb-5 px-4 py-3 bg-red-900/40 border border-red-700 rounded-md text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={set('name')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="corp_workstations"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Type *</label>
            <select
              value={form.type}
              onChange={set('type')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:border-blue-500 text-sm"
            >
              {OBJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {form.name && (
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Template Placeholder
              <span className="ml-2 text-slate-500 font-normal text-xs">
                paste this directly into any log template
              </span>
            </label>
            <div className="flex items-center gap-2">
              <code
                className={[
                  'flex-1 px-3 py-2 bg-slate-900 border rounded-md text-sm font-mono select-all transition-colors',
                  placeholder && slugify(form.name) === placeholder
                    ? 'border-slate-600 text-green-400'
                    : 'border-amber-700/50 text-amber-300',
                ].join(' ')}
              >
                {`{{ ${slugify(form.name)} }}`}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!placeholder || slugify(form.name) !== placeholder}
                title={
                  !placeholder
                    ? 'Save first to copy'
                    : slugify(form.name) !== placeholder
                    ? 'Save the name change first'
                    : 'Copy to clipboard'
                }
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-600 rounded-md text-sm text-slate-300 transition-colors"
              >
                {copied ? (
                  <><Check className="w-4 h-4 text-green-400" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4" /> Copy</>
                )}
              </button>
            </div>
            {placeholder && slugify(form.name) !== placeholder && (
              <p className="mt-1 text-xs text-amber-400/80">
                Placeholder will change to <code className="font-mono">{slugify(form.name)}</code> on save - update any templates that use the old one.
              </p>
            )}
            <p className="mt-1.5 flex items-center gap-1.5 text-xs">
              <FileText className="w-3.5 h-3.5 text-slate-500 flex-none" />
              {usageCount > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate(`/use-cases?object=${encodeURIComponent(placeholder ?? '')}`)}
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

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={set('description')}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
            placeholder="Corporate workstation IP addresses"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Category
            <span className="ml-2 text-slate-500 font-normal text-xs">optional - groups this object in the list</span>
          </label>
          <CategoryCombobox
            value={form.category}
            onChange={(category) => setForm((prev) => ({ ...prev, category }))}
            options={Array.from(new Set([...KNOWN_CATEGORIES, ...existingCategories])).sort()}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Values
            <span className="ml-2 text-slate-500 font-normal text-xs">
              {TYPE_HINTS[form.type]}
            </span>
          </label>
          <textarea
            value={form.valuesText}
            onChange={set('valuesText')}
            rows={10}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm font-mono resize-y"
            placeholder={TYPE_HINTS[form.type]}
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-slate-500">
            {parseValues().length} {parseValues().length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        <div className="flex items-center gap-6 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-40 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Object'}
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
            onClick={() => navigate('/my-objects')}
            className="w-28 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-md transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
