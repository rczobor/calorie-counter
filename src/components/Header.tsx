import { Link } from '@tanstack/react-router'
import { SignedIn } from '@clerk/clerk-react'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import { DatabaseZap, Flame, ShieldCheck } from 'lucide-react'
import ThemeSelector from './theme-selector'
import { isClerkConfigured } from '@/integrations/clerk/config'

const NAV_ITEMS = [
  { to: '/', label: 'Meals' },
  { to: '/manage', label: 'Manage' },
  { to: '/cooking', label: 'Cooking' },
  { to: '/people', label: 'People' },
] as const

const NAV_LINK_CLASS =
  'whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

const NAV_LINK_ACTIVE_CLASS =
  'rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-sm supports-[backdrop-filter]:bg-background/70 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(9,14,24,0.98)_0%,rgba(9,14,24,0.88)_100%)]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link to="/">
              <span
                data-display="true"
                className="inline-flex items-center gap-2 whitespace-nowrap text-base text-foreground sm:text-lg"
              >
                <Flame className="h-5 w-5 text-amber-500" />
                Calorie Counter
              </span>
            </Link>
            {isClerkConfigured ? (
              <SignedIn>
                <nav className="hidden items-center gap-2 md:flex">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={NAV_LINK_CLASS}
                      activeProps={{ className: NAV_LINK_ACTIVE_CLASS }}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </SignedIn>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <ThemeSelector />
            {isClerkConfigured ? (
              <SignedIn>
                <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground lg:flex">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  Shell mode
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs text-muted-foreground lg:flex">
                  <DatabaseZap className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                  Convex ready
                </div>
              </SignedIn>
            ) : null}
            <ClerkHeader />
          </div>
        </div>
        {isClerkConfigured ? (
          <SignedIn>
            <nav className="flex items-center gap-2 overflow-x-auto pb-3 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={NAV_LINK_CLASS}
                  activeProps={{ className: NAV_LINK_ACTIVE_CLASS }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SignedIn>
        ) : null}
      </div>
    </header>
  )
}
