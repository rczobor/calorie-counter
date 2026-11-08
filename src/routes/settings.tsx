import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { InstallEntry } from '@/features/install/install-entry'
import { LanguageSetting } from '@/features/language/language-setting'
import { intlLocale, useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import ThemeSelector from '@/components/theme-selector'
import HeaderUser from '@/integrations/clerk/header-user'
import { formatDate } from '@/lib/dates'
import { readStartupTimings } from '@/lib/startup-timing'
import { cn } from '@/lib/utils'
import { messages } from './settings.messages'

export const Route = createFileRoute('/settings')({
  ssr: false,
  component: SettingsPage,
})

function SettingsPage() {
  const t = useMessages(messages)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  if (pathname.replace(/\/$/, '') !== '/settings') return <Outlet />
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-6 sm:px-6 md:pt-8">
      <h1 className="type-large-title">{t.title}</h1>
      {/* Phones have no app bar, so the account and theme live here. */}
      <section aria-labelledby="settings-account" className="mt-6 md:hidden">
        <h2 id="settings-account" className="group-label">
          {t.account}
        </h2>
        <div className="inset-group inset-rows">
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
            <span>{t.signedIn}</span>
            <HeaderUser row />
          </div>
          <ThemeSelector row />
        </div>
      </section>
      {/* Every group has a header, and rows carry no icons: the labels are
          short enough to scan, and nothing competes with the values. */}
      <section aria-labelledby="settings-setup" className="mt-8 md:mt-6">
        <h2 id="settings-setup" className="group-label">
          {t.setup}
        </h2>
        <div className="inset-group inset-rows">
          <SettingsLink to="/people" title={t.people} />
          <SettingsLink to="/weight" title={t.weight} />
          <SettingsLink to="/settings/integrations" title={t.assistants} />
          <SettingsLink to="/household" title={t.household} />
          <LanguageSetting />
          <InstallEntry variant="settings" />
        </div>
      </section>
      <section aria-labelledby="settings-data" className="mt-8">
        <h2 id="settings-data" className="group-label">
          {t.dataMaintenance}
        </h2>
        <div className="inset-group inset-rows">
          <SettingsLink to="/settings/archived-meals" title={t.archivedMeals} />
          <SettingsLink to="/catalog" title={t.foodLibrary} />
          <SettingsLink to="/cooking" title={t.cooking} />
        </div>
      </section>
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
    | '/weight'
    | '/settings/integrations'
    | '/household'
    | '/catalog'
    | '/cooking'
    | '/settings/archived-meals'
  title: string
}) {
  return (
    <Link to={to} className={LIST_ROW_CLASS}>
      <span className="min-w-0 flex-1">{title}</span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  )
}

function seconds(milliseconds: number | undefined, locale: Locale) {
  return milliseconds === undefined
    ? '–'
    : `${(milliseconds / 1000).toLocaleString(intlLocale(locale), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })} s`
}

// Cold-start diagnostics for slow launches on a specific device, kept out of
// the way under a disclosure.
function StartupTimings() {
  const t = useMessages(messages)
  const locale = useLocale()
  const [timings] = useState(readStartupTimings)
  if (timings.length === 0) return null
  // The app's date, then the time: "Sun, Nov 8, 9:41 AM".
  const startTime = new Intl.DateTimeFormat(intlLocale(locale), {
    timeStyle: 'short',
  })
  return (
    <section aria-labelledby="settings-diagnostics" className="mt-8">
      <h2 id="settings-diagnostics" className="group-label">
        {t.diagnostics}
      </h2>
      <details className="group inset-group">
        <summary
          className={cn(
            LIST_ROW_CLASS,
            'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
          )}
        >
          <span className="min-w-0 flex-1">{t.recentStarts}</span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <p className="border-t px-4 pt-3 type-footnote text-muted-foreground">
          {t.recentStartsHint}
        </p>
        <ul className="inset-rows">
          {timings.map((timing) => (
            <li key={timing.at} className="space-y-1 px-4 py-3">
              <div className="flex justify-between gap-4 type-subhead">
                <span className="font-medium">
                  {`${formatDate(timing.at, locale)}, ${startTime.format(timing.at)}`}
                </span>
                <span className="font-medium tabular-nums">
                  {seconds(timing.household, locale)}
                </span>
              </div>
              <p className="type-footnote text-muted-foreground tabular-nums">
                {t.timings({
                  page: seconds(timing.page, locale),
                  app: seconds(timing.app, locale),
                  signIn: seconds(timing.clerk, locale),
                  data: seconds(timing.convex, locale),
                })}
                {timing.standalone ? t.homeScreenApp : t.browser}
                {timing.serviceWorker ? t.cachedFiles : ''}
              </p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
