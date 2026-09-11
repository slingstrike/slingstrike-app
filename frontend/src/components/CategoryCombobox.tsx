import { useState } from 'react'

// A real dropdown for "Category" fields, not a free-text input with suggestions.
// `options` should already be the merged, deduplicated, sorted list the caller
// wants offered (typically: a handful of hardcoded suggestions + whatever
// categories are already in use by real items) - this component stays dumb
// about where that list comes from. Falls back to a plain text input only
// when the user explicitly picks "+ Add new category...".
export default function CategoryCombobox({
  value,
  onChange,
  options,
  id,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
  id?: string
}) {
  const [addingNew, setAddingNew] = useState(false)

  if (addingNew) {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New category name"
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 text-sm"
        />
        <button
          type="button"
          onClick={() => { setAddingNew(false); onChange('') }}
          className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors flex-none"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select
      id={id}
      value={options.includes(value) ? value : ''}
      onChange={(e) => {
        if (e.target.value === '__new__') setAddingNew(true)
        else onChange(e.target.value)
      }}
      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:border-blue-500 text-sm"
    >
      <option value="" disabled>Select category...</option>
      {options.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
      <option value="__new__">+ Add new category...</option>
    </select>
  )
}
