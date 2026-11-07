import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Show } from '@clerk/react'
import { Clock, Flame, Plus, Settings, UtensilsCrossed } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import { Button } from '@/components/ui/button'
import { requestLogMeal } from '@/features/meals/log-meal-request'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { cn } from '@/lib/utils'
import { isE2eMockMode } from '@/testing/e2e/config'

const ThemeSelector = lazy(() => import('./theme-selector'))

const NAV_ITEMS = [
  { to: '/', label: 'Today', icon: UtensilsCrossed },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const
const NAV_LINK_CLASS =
  'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
const NAV_LINK_ACTIVE_CLASS =
  'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary'

function usePathname() {
  return useRouterState({ select: (state) => state.location.pathname })
}

function isActive(pathname: string, to: (typeof NAV_ITEMS)[number]['to']) {
  if (to !== '/settings') return pathname === to
  return (
    ['/people', '/household', '/catalog', '/cooking'].includes(pathname) ||
    pathname.startsWith('/settings')
  )
}

function SignedInOnly({ children }: { children: ReactNode }) {
  if (isE2eMockMode) return children
  return isClerkConfigured ? <Show when="signed-in">{children}</Show> : null
}

function HeaderNavigation() {
  const pathname = usePathname()
  return (
    <SignedInOnly>
      <nav
        aria-label="Primary navigation"
        className="hidden items-center gap-1 md:flex"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              aria-current={active ? 'page' : undefined}
              className={active ? NAV_LINK_ACTIVE_CLASS : NAV_LINK_CLASS}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </SignedInOnly>
  )
}

/** Phone navigation: tabs within thumb reach and one action to log a meal from any tab. */
export function BottomNavigation() {
  const pathname = usePathname()
  const navigate = useNavigate()
  return (
    <SignedInOnly>
      <nav
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/85 md:hidden"
      >
        <div className="mx-auto flex max-w-xl items-center gap-1 px-2 py-1.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  active
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full',
                    active && 'bg-primary/12',
                  )}
                >
                  <item.icon aria-hidden="true" className="size-[18px]" />
                </span>
                {item.label}
              </Link>
            )
          })}
          <Button
            className="ml-1.5 h-12 shrink-0 rounded-full px-5 font-semibold shadow-sm"
            onClick={() => {
              requestLogMeal()
              if (pathname !== '/') void navigate({ to: '/' })
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Log meal
          </Button>
        </div>
      </nav>
    </SignedInOnly>
  )
}

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex min-h-14 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Link to="/">
              <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-bold tracking-tight text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Flame className="h-4 w-4" />
                </span>
                Calorie Counter
              </span>
            </Link>
            <HeaderNavigation />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Suspense fallback={<div aria-hidden className="size-9" />}>
              <ThemeSelector />
            </Suspense>
            <ClerkHeader />
          </div>
        </div>
      </div>
    </header>
  )
}
