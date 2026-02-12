import { Link } from '@tanstack/react-router'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import { DatabaseZap, Flame, ShieldCheck } from 'lucide-react'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <span
              data-display="true"
              className="inline-flex items-center gap-2 text-lg text-slate-950"
            >
              <Flame className="h-5 w-5 text-amber-500" />
              Calorie Counter
            </span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link
              to="/"
              className="rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              activeProps={{
                className:
                  'rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-900',
              }}
            >
              Dashboard
            </Link>
            <Link
              to="/demo/clerk"
              className="rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              activeProps={{
                className:
                  'rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-900',
              }}
            >
              Auth
            </Link>
            <Link
              to="/demo/convex"
              className="rounded-md px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              activeProps={{
                className:
                  'rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-900',
              }}
            >
              Convex
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Shell mode
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 sm:flex">
            <DatabaseZap className="h-3.5 w-3.5 text-cyan-600" />
            Convex ready
          </div>
          <ClerkHeader />
        </div>
      </div>
    </header>
  )
}
