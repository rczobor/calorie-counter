import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { InstallEntry } from '@/features/install/install-entry'
import { readStartupTimings } from '@/lib/startup-timing'

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
        <SettingsLink to="/settings/integrations" title="AI assistants" />
        <SettingsLink to="/household" title="Household" />
        <InstallEntry variant="settings" />
      </div>
      <h2 className="mt-8 text-sm font-semibold">Data maintenance</h2>
      <div className="mt-3 divide-y border-y border-border/60">
        <SettingsLink to="/settings/archived-meals" title="Archived meals" />
        <SettingsLink to="/catalog" title="Food library" />
        <SettingsLink to="/cooking" title="Cooked batches" />
      </div>
      <StartupTimings />
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

const startedAt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function seconds(milliseconds: number | undefined) {
  return milliseconds === undefined
    ? '–'
    : `${(milliseconds / 1000).toFixed(1)} s`
}

// Cold-start diagnostics for slow launches on a specific device.
function StartupTimings() {
  const [timings] = useState(readStartupTimings)
  if (timings.length === 0) return null
  return (
    <>
      <h2 className="mt-8 text-sm font-semibold">Recent app starts</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Time from launch until each step finished on this device.
      </p>
      <ul className="mt-3 divide-y border-y border-border/60">
        {timings.map((timing) => (
          <li key={timing.at} className="space-y-1 py-4 text-sm">
            <div className="flex justify-between gap-4">
              <span className="font-medium">{startedAt.format(timing.at)}</span>
              <span className="font-medium tabular-nums">
                {seconds(timing.household)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">
              Page {seconds(timing.page)} · App {seconds(timing.app)} · Sign-in{' '}
              {seconds(timing.clerk)} · Data {seconds(timing.convex)} ·{' '}
              {timing.standalone ? 'Home Screen app' : 'Browser'}
              {timing.serviceWorker ? ' · Cached files' : ''}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
