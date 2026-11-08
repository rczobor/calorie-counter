import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { Show } from '@clerk/react'
import { Clock, Flame, House, Plus, Settings } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import { Button } from '@/components/ui/button'
import { requestLogMeal } from '@/features/meals/log-meal-request'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { cn } from '@/lib/utils'
import { isE2eMockMode } from '@/testing/e2e/config'

const ThemeSelector = lazy(() => import('./theme-selector'))

const NAV_ITEMS = [
  { to: '/', label: 'Today', icon: House },
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
  if (to === '/') return pathname === '/' || pathname === '/weight'
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
  const activeIndex = NAV_ITEMS.findIndex((item) => isActive(pathname, item.to))
  return (
    <SignedInOnly>
      {/* Floats over the content; the installed iPhone app tucks it just above
          the home indicator, browsers keep a small gap. Only the glass itself
          blurs what is behind it. */}
      <nav
        aria-label="Primary navigation"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom)_-_0.5rem)] md:hidden"
      >
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-2">
          <div className="glass relative flex min-w-0 flex-1 items-center rounded-full p-1">
            {/* One highlight glides between the equal-width tabs; it hides on
                pages outside the tabs, such as /connect. */}
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-y-1 left-1 rounded-full bg-primary/14 transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none dark:bg-primary/10',
                activeIndex < 0 && 'opacity-0',
              )}
              style={{
                width: `calc((100% - 0.5rem) / ${NAV_ITEMS.length})`,
                translate: `${Math.max(activeIndex, 0) * 100}%`,
              }}
            />
            {NAV_ITEMS.map((item, index) => {
              const active = index === activeIndex
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.label}
                  className={cn(
                    'relative flex h-11 flex-1 items-center justify-center rounded-full transition-[color,scale] focus-visible:outline-2 focus-visible:outline-ring motion-safe:active:scale-90',
                    active
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <item.icon aria-hidden="true" className="size-6" />
                </Link>
              )
            })}
          </div>
          <Button
            size="icon"
            aria-label="Log meal"
            className="size-13 rounded-full shadow-[0_10px_30px_-10px_var(--glass-shadow)] motion-safe:active:scale-90"
            onClick={() => {
              requestLogMeal()
              if (pathname !== '/') void navigate({ to: '/' })
            }}
          >
            <Plus aria-hidden="true" className="size-6" />
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
