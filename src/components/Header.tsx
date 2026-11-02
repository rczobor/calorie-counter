import { Link, useRouterState } from '@tanstack/react-router'
import { Show } from '@clerk/react'
import { Clock, Flame, Settings, UtensilsCrossed } from 'lucide-react'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import ThemeSelector from './theme-selector'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { isE2eMockMode } from '@/testing/e2e/config'

const NAV_ITEMS = [
  { to: '/', label: 'Today', icon: UtensilsCrossed },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const
const NAV_LINK_CLASS =
  'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
const NAV_LINK_ACTIVE_CLASS =
  'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary'

function HeaderNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const settings =
    ['/people', '/household', '/catalog', '/cooking'].includes(pathname) ||
    pathname.startsWith('/settings')
  const navigation = (
    <nav
      aria-label="Primary navigation"
      className={
        mobile
          ? 'flex items-center gap-1 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
          : 'hidden items-center gap-1 md:flex'
      }
    >
      {NAV_ITEMS.map((item) => {
        const active = item.to === '/settings' ? settings : pathname === item.to
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
  )
  if (isE2eMockMode) return navigation
  return isClerkConfigured ? <Show when="signed-in">{navigation}</Show> : null
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
            <ThemeSelector />
            <ClerkHeader />
          </div>
        </div>
        <div className="md:hidden">
          <HeaderNavigation mobile />
        </div>
      </div>
    </header>
  )
}
