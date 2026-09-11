import { Lock } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-white mb-6">Settings</h1>

      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-slate-700 rounded-md">
            <Lock className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-base font-medium text-white">Authentication</h2>
            <p className="text-sm text-slate-400 mt-1">
              Single-admin authentication with bcrypt passwords and JWT sessions is coming in v0.4.
            </p>
            <p className="text-xs text-slate-500 mt-3 font-mono">
              Planned: account lockout, password reset, configurable JWT expiry
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 bg-slate-900 border border-slate-700 rounded-lg p-6">
        <h2 className="text-base font-medium text-white mb-3">About</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-4">
            <dt className="text-slate-400 w-28">Version</dt>
            <dd className="text-slate-200 font-mono">v0.3 Alpha</dd>
          </div>
          <div className="flex gap-4">
            <dt className="text-slate-400 w-28">License</dt>
            <dd className="text-slate-200">Apache 2.0</dd>
          </div>
          <div className="flex gap-4">
            <dt className="text-slate-400 w-28">Database</dt>
            <dd className="text-slate-200 font-mono">SQLite (aiosqlite)</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
