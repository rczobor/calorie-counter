import { Link } from '@tanstack/react-router'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import { DatabaseZap, Flame, ShieldCheck } from 'lucide-react'
import ThemeSelector from './theme-selector'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(9,14,24,0.98)_0%,rgba(9,14,24,0.88)_100%)]">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link to="/">
            <span
              data-display="true"
              className="inline-flex items-center gap-2 text-lg text-foreground"
            >
              <Flame className="h-5 w-5 text-amber-500" />
              Calorie Counter
            </span>
          </Link>
          <nav className="hidden items-center gap-2 md:flex">
            <Link
              to="/"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{
                className:
                  'rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground',
              }}
            >
              Meals
            </Link>
            <Link
              to="/manage"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{
                className:
                  'rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground',
              }}
            >
              Manage
            </Link>
            <Link
              to="/people"
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              activeProps={{
                className:
                  'rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground',
              }}
            >
              People
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeSelector />
          <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground lg:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Shell mode
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground lg:flex">
            <DatabaseZap className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            Convex ready
          </div>
          <ClerkHeader />
        </div>
      </div>
    </header>
  )
}
