import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createObject } from '../../api/objects'
import type { ObjectGroup, ObjectType } from '../../api/types'
import { OBJECT_TYPES, TYPE_HINTS, KNOWN_CATEGORIES, slugifyObj } from './objectCatalog'
import CategoryCombobox from '../../components/CategoryCombobox'

interface FormState {
  name: string
  description: string
  type: ObjectType
  category: string
  valuesText: string
}

export default function CreateObjectModal({
  initialName = '',
  existingCategories = [],
  onClose,
  onCreated,
}: {
  initialName?: string
  existingCategories?: string[]
  onClose: () => void
  onCreated: (object: ObjectGroup) => void
}) {
  const categoryOptions = Array.from(
    new Set([...KNOWN_CATEGORIES, ...existingCategories.filter(Boolean)])
  ).sort()
  const [form, setForm] = useState<FormState>({
    name: initialName,
    description: '',
    type: 'ipv4',
    category: '',
    valuesText: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const parseValues = () =>
    form.valuesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSubmit = async () => {
    setSaving(true)
    setError(null)
    try {
      const obj = await createObject({
        name: form.name,
        description: form.description,
        type: form.type,
        category: form.category,
        values: parseValues(),
      })
      onCreated(obj)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  const currentPlaceholder = form.name ? slugifyObj(form.name) : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700">
          <div>
            <h2 className="text-white font-semibold text-base">New Object</h2>
            <p className="mt-0.5 text-xs text-slate-500">Resolves to a value picked from a specific list you maintain - not randomly generated</p>
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
              onChange={set('description')}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
              placeholder="Corporate workstation IP addresses"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Category
              <span className="ml-2 text-slate-500 font-normal text-xs">optional</span>
            </label>
            <CategoryCombobox
              value={form.category}
              onChange={(category) => setForm((prev) => ({ ...prev, category }))}
              options={categoryOptions}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Values
              <span className="ml-2 text-slate-500 font-normal text-xs">{TYPE_HINTS[form.type]}</span>
            </label>
            <textarea
              value={form.valuesText}
              onChange={set('valuesText')}
              rows={6}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm font-mono resize-y"
              placeholder={TYPE_HINTS[form.type]}
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-slate-500">
              {parseValues().length} {parseValues().length === 1 ? 'entry' : 'entries'}
            </p>
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
            {saving ? 'Creating...' : 'Create Object'}
          </button>
        </div>
      </div>
    </div>
  )
}
