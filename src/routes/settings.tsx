import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

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
      <p className="mt-1 text-sm text-muted-foreground">
        People, your household, and connected assistants.
      </p>
      <div className="mt-6 divide-y border-y border-border/60">
        <SettingsLink
          to="/people"
          title="People & goals"
          description="Manage tracked people and their daily goals."
        />
        <SettingsLink
          to="/settings/integrations"
          title="ChatGPT"
          description="Connections, permissions, and remembered logging defaults."
        />
        <SettingsLink
          to="/household"
          title="Household"
          description="Switch household, invite people, and manage membership."
        />
      </div>
      <h2 className="mt-8 text-sm font-semibold">Data maintenance</h2>
      <div className="mt-3 divide-y border-y border-border/60">
        <SettingsLink
          to="/catalog"
          title="Food library"
          description="Reusable foods, ingredients, recipes, and optional groups."
        />
        <SettingsLink
          to="/cooking"
          title="Cooked batches"
          description="Inspect nutrition, correct weights, and archive batches."
        />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Keep logging meals and cooking through ChatGPT. Theme and account
        controls are in the header.
      </p>
    </main>
  )
}

function SettingsLink({
  to,
  title,
  description,
}: {
  to:
    | '/people'
    | '/settings/integrations'
    | '/household'
    | '/catalog'
    | '/cooking'
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-4 py-5 text-sm hover:text-primary"
    >
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  )
}
