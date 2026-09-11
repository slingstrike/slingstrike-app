import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, Braces, FileText, Globe, Layers, Lock, Network, Package, Server, Settings, Variable } from 'lucide-react'

type NavIcon = React.ComponentType<{ className?: string }>

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: NavIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
        ].join(' ')
      }
    >
      <Icon className="w-4 h-4 flex-none" />
      {label}
    </NavLink>
  )
}

function NavSubItem({ to, label, icon: Icon }: { to: string; label: string; icon: NavIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 pl-7 pr-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
        ].join(' ')
      }
    >
      <Icon className="w-3.5 h-3.5 flex-none" />
      {label}
    </NavLink>
  )
}

export default function Layout() {
  return (
    <div className="flex h-screen bg-slate-900 text-slate-100">
      <aside className="w-56 flex-none flex flex-col bg-slate-900 border-r border-slate-700">
        <div className="flex items-center px-4 py-5 border-b border-slate-700">
          <img src="/logo.svg" alt="SlingStrike" className="h-8 w-auto" />
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          <NavItem to="/use-cases" label="My Use Cases" icon={FileText} />
          <NavItem to="/destinations" label="My Destinations" icon={Server} />
          <NavItem to="/my-objects" label="My Objects" icon={Layers} />
          <NavItem to="/my-variables" label="My Variables" icon={Variable} />

          {/* Library group - Community (v0.5) and Premium Packs (v0.6) */}
          <div className="pt-3 pb-1">
            <div className="flex items-center gap-2 px-3 pb-1">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Library
              </span>
            </div>
            <NavSubItem to="/library/community" label="Community Packs" icon={Globe} />
            <NavSubItem to="/library/siem-profiles" label="SIEM Profiles" icon={Network} />
            <NavSubItem to="/library/objects" label="Objects" icon={Package} />
            <NavSubItem to="/library/variables" label="Variables" icon={Braces} />
            <NavSubItem to="/library/premium-packs" label="Premium Packs" icon={Lock} />
          </div>

          <NavItem to="/settings" label="Settings" icon={Settings} />
        </nav>

        <div className="px-4 py-3 border-t border-slate-700">
          <p className="text-xs text-slate-500">v0.3 Alpha - No auth</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-800">
        <Outlet />
      </main>
    </div>
  )
}
