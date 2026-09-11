import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

export default function LibraryPremiumPacksPage() {
  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-3 mb-2">
        <Lock className="w-5 h-5 text-amber-400" />
        <h1 className="text-xl font-semibold text-white">Premium Packs</h1>
      </div>
      <p className="text-slate-400 text-sm mb-8">
        Premium packs are curated collections of advanced use cases sold separately. Each pack is
        activated with a license key and verified offline - no external connection required.
      </p>

      {/* Locked state - shown until a premium license is activated (v0.6+) */}
      <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-6 py-12 text-center">
        <Lock className="w-10 h-10 text-amber-600/60 mx-auto mb-3" />
        <p className="text-white font-medium mb-1">No premium packs activated</p>
        <p className="text-slate-400 text-sm mb-4">
          To activate a pack, go to{' '}
          <Link to="/settings" className="text-blue-400 hover:underline">
            Settings &rsaquo; License Keys
          </Link>{' '}
          and upload your activation package.
        </p>
        <p className="text-xs text-slate-500">
          Premium packs require an active SlingStrike license. Available from v0.6.
        </p>
      </div>
    </div>
  )
}
