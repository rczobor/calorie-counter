import { Link } from '@tanstack/react-router'
import { SignedIn } from '@clerk/clerk-react'
import ClerkHeader from '../integrations/clerk/header-user.tsx'
import {
  BookOpen,
  ChefHat,
  Clock,
  Flame,
  Users,
  UtensilsCrossed,
} from 'lucide-react'
import ThemeSelector from './theme-selector'
import { isClerkConfigured } from '@/integrations/clerk/config'

const NAV_ITEMS = [
  { to: '/', label: 'Meals', icon: UtensilsCrossed },
  { to: '/cooking', label: 'Cooking', icon: ChefHat },
  { to: '/catalog', label: 'Catalog', icon: BookOpen },
  { to: '/people', label: 'People', icon: Users },
  { to: '/history', label: 'History', icon: Clock },
] as const

const NAV_LINK_CLASS =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

const NAV_LINK_ACTIVE_CLASS =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-[13px] font-medium text-primary'

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex h-12 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <Link to="/">
              <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-bold tracking-tight text-foreground">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Flame className="h-4 w-4" />
                </span>
                Calorie Counter
              </span>
            </Link>
            {isClerkConfigured ? (
              <SignedIn>
                <nav className="hidden items-center gap-1 md:flex">
                  {NAV_ITEMS.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={NAV_LINK_CLASS}
                      activeProps={{ className: NAV_LINK_ACTIVE_CLASS }}
                    >
                      <item.icon className="h-3.5 w-3.5" />
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
            <nav className="flex items-center gap-1 overflow-x-auto pb-2 md:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={NAV_LINK_CLASS}
                  activeProps={{ className: NAV_LINK_ACTIVE_CLASS }}
                >
                  <item.icon className="h-3.5 w-3.5" />
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
