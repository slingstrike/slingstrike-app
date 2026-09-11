import { useRef } from 'react'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'

// ── Custom language registration (once per page load) ────────────────────────

const OLF_LANG = 'olf-template'
let _langRegistered = false
let _completionDisposable: Monaco.IDisposable | null = null

// Module-level list updated by the active editor instance for completion items
const _completionItems: { name: string; detail?: string }[] = []

function ensureLanguage(monaco: typeof Monaco) {
  if (_langRegistered) return
  _langRegistered = true

  monaco.languages.register({ id: OLF_LANG })

  // Monarch tokenizer
  monaco.languages.setMonarchTokensProvider(OLF_LANG, {
    tokenizer: {
      root: [
        // Comment line - ignored entirely at send time, highest priority
        [/^\s*#.*$/, 'comment'],

        // {{ placeholder }} - highest priority, matches whole token
        [/\{\{\s*\w+\s*\}\}/, 'olf.placeholder'],

        // Syslog priority <NNN>
        [/<\d{1,3}>/, 'olf.priority'],

        // ISO 8601 / RFC 5424 timestamp
        [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/, 'olf.timestamp'],

        // RFC 3164 timestamp: Jan  1 00:00:00
        [/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s{1,2}\d{1,2}\s\d{2}:\d{2}:\d{2}/, 'olf.timestamp'],

        // CEF/LEEF header pipe separators
        [/\|/, 'olf.pipe'],

        // Key=value attribute keys (CEF/LEEF/custom)
        [/\b\w+(?==)/, 'olf.key'],

        // Quoted strings
        [/"[^"]*"/, 'string'],

        // IPv4 addresses
        [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, 'olf.ip'],

        // Numbers
        [/\b\d+\b/, 'number'],
      ],
    },
  } as Monaco.languages.IMonarchLanguage)

  monaco.editor.defineTheme('olf-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment',         foreground: '64748b', fontStyle: 'italic' }, // slate-500
      { token: 'olf.placeholder', foreground: '7dd3fc', fontStyle: 'bold' },  // sky-300
      { token: 'olf.priority',    foreground: 'fb923c' },                     // orange-400
      { token: 'olf.timestamp',   foreground: 'c4b5fd' },                     // violet-300
      { token: 'olf.pipe',        foreground: '64748b' },                     // slate-500
      { token: 'olf.key',         foreground: '86efac' },                     // green-300
      { token: 'olf.ip',          foreground: 'fda4af' },                     // rose-300
      { token: 'string',          foreground: 'fcd34d' },                     // amber-300
      { token: 'number',          foreground: 'e2e8f0' },                     // slate-200
    ],
    colors: {},
  })
}

function ensureCompletionProvider(monaco: typeof Monaco) {
  if (_completionDisposable) return
  _completionDisposable = monaco.languages.registerCompletionItemProvider(OLF_LANG, {
    triggerCharacters: ['{'],
    provideCompletionItems(model, position) {
      const textBefore = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      // Only activate when cursor is inside {{ (after {{ with optional space + partial word)
      const match = textBefore.match(/\{\{\s*(\w*)$/)
      if (!match) return { suggestions: [] }

      const typed = match[1]
      const replaceStart = position.column - typed.length

      return {
        suggestions: _completionItems.map((item) => ({
          label: item.name,
          kind: monaco.languages.CompletionItemKind.Variable,
          detail: item.detail,
          documentation: `Insert as {{ ${item.name} }}`,
          insertText: `${item.name} }}`,
          filterText: item.name,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: replaceStart,
            endColumn: position.column,
          },
        })),
      }
    },
  })
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CompletionItem {
  name: string
  detail?: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  logFormat: string
  previewValues?: Record<string, string>
  completionItems?: CompletionItem[]
}

function renderPreview(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => vars[name] ?? `<${name}>`)
}

function monacoLang(logFormat: string): string {
  if (logFormat === 'json') return 'json'
  if (logFormat === 'windows_evtxml') return 'xml'
  return OLF_LANG
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TemplateEditor({ value, onChange, logFormat, previewValues = {}, completionItems = [] }: Props) {
  const preview = renderPreview(value, previewValues)
  const lang = monacoLang(logFormat)
  const lineCount = value.split('\n').filter((ln) => ln.trim() && !ln.trim().startsWith('#')).length

  // Keep module-level completion list current for this editor instance
  _completionItems.length = 0
  _completionItems.push(...completionItems)

  const monacoRef = useRef<typeof Monaco | null>(null)

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco
    ensureLanguage(monaco)
    ensureCompletionProvider(monaco)
  }

  const handleMount: OnMount = (editor) => {
    // Ensure cursor ends up in the editor on first focus
    editor.focus()
  }

  const theme = lang === OLF_LANG ? 'olf-dark' : 'vs-dark'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-xs text-slate-400 font-medium"
            title="Lines starting with # are treated as comments and are not sent"
          >
            Template
          </span>
          {lineCount > 1 && (
            <span className="text-xs text-blue-400">
              {lineCount} lines - sent as {lineCount} separate messages, in order
            </span>
          )}
        </div>
        <div className="rounded border border-slate-600 overflow-hidden" style={{ height: '200px' }}>
          <Editor
            height="200px"
            language={lang}
            value={value}
            onChange={(v) => onChange(v ?? '')}
            theme={theme}
            beforeMount={handleBeforeMount}
            onMount={handleMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              renderLineHighlight: 'none',
              overviewRulerBorder: false,
              suggestOnTriggerCharacters: true,
              quickSuggestions: { other: true, comments: false, strings: false },
              acceptSuggestionOnEnter: 'on',
            }}
          />
        </div>
      </div>

      <div className="flex flex-col">
        <span className="text-xs text-slate-400 mb-1 font-medium">Live Preview</span>
        <pre className="rounded border border-slate-600 bg-slate-900 p-3 text-xs text-green-300 font-mono overflow-auto whitespace-pre-wrap min-h-16 max-h-48">
          {preview || <span className="text-slate-500">Preview will appear here</span>}
        </pre>
      </div>
    </div>
  )
}
