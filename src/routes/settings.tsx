import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { InstallEntry } from '@/features/install/install-entry'

export const Route = createFileRoute('/settings')({
  ssr: false,
  component: SettingsPage,
})

function SettingsPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  if (pathname.replace(/\/$/, '') !== '/settings') return <Outlet />
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <div className="mt-6 divide-y border-y border-border/60">
        <SettingsLink to="/people" title="People & goals" />
        <SettingsLink to="/settings/integrations" title="ChatGPT" />
        <SettingsLink to="/household" title="Household" />
        <InstallEntry variant="settings" />
      </div>
      <h2 className="mt-8 text-sm font-semibold">Data maintenance</h2>
      <div className="mt-3 divide-y border-y border-border/60">
        <SettingsLink to="/settings/archived-meals" title="Archived meals" />
        <SettingsLink to="/catalog" title="Food library" />
        <SettingsLink to="/cooking" title="Cooked batches" />
      </div>
    </main>
  )
}

function SettingsLink({
  to,
  title,
}: {
  to:
    | '/people'
    | '/settings/integrations'
    | '/household'
    | '/catalog'
    | '/cooking'
    | '/settings/archived-meals'
  title: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 py-5 text-sm hover:text-primary"
    >
      <div>
        <p className="font-medium">{title}</p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  )
}
