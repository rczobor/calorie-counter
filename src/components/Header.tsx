import { Link } from '@tanstack/react-router'
import { SignedIn } from '@clerk/clerk-react'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import { Flame } from 'lucide-react'
import ThemeSelector from './theme-selector'
import { isClerkConfigured } from '@/integrations/clerk/config'

const NAV_ITEMS = [
  { to: '/', label: 'Meals' },
  { to: '/cooking', label: 'Cooking' },
  { to: '/catalog', label: 'Catalog' },
  { to: '/people', label: 'People' },
  { to: '/history', label: 'History' },
] as const

const NAV_LINK_CLASS =
  'whitespace-nowrap rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground'

const NAV_LINK_ACTIVE_CLASS =
  'rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex h-10 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Link to="/">
              <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-foreground">
                <Flame className="h-4 w-4 text-foreground/80" />
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
            <ClerkHeader />
          </div>
        </div>
        {isClerkConfigured ? (
          <SignedIn>
            <nav className="flex items-center gap-2 overflow-x-auto pb-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
