import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState, type ReactNode } from 'react'
import { api } from '../../../convex/_generated/api'
import { LoadingRows } from '@/components/page/loading-content'
import { PageShell } from '@/components/page/page-shell'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { intlLocale, useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatDate } from '@/lib/dates'
import { toLocalDateString } from '@/lib/nutrition'
import { messages } from './usage-dashboard.messages'

type Engagement = FunctionReturnType<typeof api.admin.engagement>
type Account = Engagement['accounts'][number]
type Totals = Engagement['totals']
type Text = (typeof messages)[Locale]

const STATUSES = [
  'slipping',
  'active',
  'new',
  'lapsed',
  'neverStarted',
] as const satisfies ReadonlyArray<Account['status']>

function share(part: number, whole: number, locale: Locale) {
  return whole === 0
    ? '–'
    : new Intl.NumberFormat(intlLocale(locale), {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(part / whole)
}

export function UsageDashboard() {
  const t = useMessages(messages)
  const isSuperAdmin = useQuery(api.admin.isSuperAdmin, {})
  // Queries cannot read the clock, so the page sends its own date.
  const [today] = useState(() => toLocalDateString(Date.now()))
  const data = useQuery(api.admin.engagement, isSuperAdmin ? { today } : 'skip')
  return (
    <PageShell
      title={t.title}
      subtitle={t.subtitle}
      breadcrumbs={<SettingsBreadcrumbs current={t.title} />}
      contentClassName="max-w-3xl"
    >
      {isSuperAdmin === false ? (
        <p className="mt-6 type-subhead text-muted-foreground">
          {t.unavailable}
        </p>
      ) : data ? (
        <UsageReport data={data} />
      ) : (
        <LoadingRows label={t.loading} className="mt-6" />
      )}
    </PageShell>
  )
}

function UsageReport({ data }: { data: Engagement }) {
  const t = useMessages(messages)
  return (
    <div className="mt-6 space-y-8">
      {data.partial ? (
        <p role="note" className="px-4 type-footnote text-muted-foreground">
          {t.partial}
        </p>
      ) : null}
      {data.awaitingConsent ? (
        <p className="px-4 type-footnote text-muted-foreground">
          {t.awaitingConsent(data.awaitingConsent)}
        </p>
      ) : null}
      {STATUSES.map((status) => {
        const accounts = data.accounts.filter((row) => row.status === status)
        return accounts.length ? (
          <section key={status} aria-labelledby={`usage-${status}`}>
            <h2
              id={`usage-${status}`}
              className="group-label flex justify-between gap-3"
            >
              {/* The space keeps "Active 2" apart for screen readers. */}
              <span>{t.status[status]}</span>{' '}
              <span className="tabular-nums">{accounts.length}</span>
            </h2>
            <ul className="inset-group inset-rows">
              {accounts.map((account) => (
                <AccountRow key={account.userId} account={account} />
              ))}
            </ul>
            <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
              {t.statusHint[status]}
            </p>
          </section>
        ) : null
      })}
      <Totals totals={data.totals} />
    </div>
  )
}

function accountDetails(account: Account, t: Text, locale: Locale) {
  const details = account.lastLoggedOn
    ? [
        t.daysLogged(account.daysLogged, account.previousDaysLogged),
        t.lastLogged(formatDate(account.lastLoggedOn, locale)),
      ]
    : [t.joined(formatDate(account.joinedAt, locale))]
  const tagged = account.webMeals + account.agentMeals
  if (account.agentMeals > 0)
    details.push(t.assistantShare(share(account.agentMeals, tagged, locale)))
  if (account.households > 1) details.push(t.households(account.households))
  if (account.partial) details.push(t.partialCounts)
  return details
}

function AccountRow({ account }: { account: Account }) {
  const t = useMessages(messages)
  const locale = useLocale()
  return (
    <li className="px-4 py-3">
      <p className="truncate type-body font-medium">
        {account.name ?? t.unnamed}
      </p>
      <p className="mt-0.5 type-footnote text-muted-foreground tabular-nums">
        {accountDetails(account, t, locale).join(' · ')}
      </p>
    </li>
  )
}

function Totals({ totals }: { totals: Totals }) {
  const t = useMessages(messages)
  const locale = useLocale()
  const items =
    totals.items.ingredient +
    totals.items.cookedFood +
    totals.items.customByWeight +
    totals.items.fixedCalories
  const days =
    totals.goalDays.under + totals.goalDays.near + totals.goalDays.over
  const ofMeals = (count: number) => share(count, totals.meals, locale)
  const ofItems = (count: number) => share(count, items, locale)
  const ofDays = (count: number) => share(count, days, locale)
  return (
    <>
      <TotalsGroup id="usage-how" title={t.howPeopleLog} note={t.allAccounts}>
        <Figure label={t.meals} value={totals.meals} />
        <Figure label={t.inApp} value={ofMeals(totals.webMeals)} />
        <Figure label={t.byAssistant} value={ofMeals(totals.agentMeals)} />
        {totals.untaggedMeals > 0 ? (
          <Figure
            label={t.beforeTracking}
            value={ofMeals(totals.untaggedMeals)}
          />
        ) : null}
        <Figure label={t.edited} value={ofMeals(totals.editedMeals)} />
        <Figure label={t.batches} value={totals.cookSessions} />
      </TotalsGroup>
      <TotalsGroup id="usage-foods" title={t.foods}>
        <Figure
          label={t.fromLibrary}
          value={ofItems(totals.items.ingredient)}
        />
        <Figure
          label={t.cookedFoods}
          value={ofItems(totals.items.cookedFood)}
        />
        <Figure
          label={t.byWeight}
          value={ofItems(totals.items.customByWeight)}
        />
        <Figure
          label={t.caloriesOnly}
          value={ofItems(totals.items.fixedCalories)}
        />
      </TotalsGroup>
      <TotalsGroup
        id="usage-goals"
        title={t.finishedDays}
        note={t.finishedDaysNote}
      >
        <Figure label={t.nearGoal} value={ofDays(totals.goalDays.near)} />
        <Figure label={t.underGoal} value={ofDays(totals.goalDays.under)} />
        <Figure label={t.overGoal} value={ofDays(totals.goalDays.over)} />
      </TotalsGroup>
    </>
  )
}

function TotalsGroup({
  id,
  title,
  note,
  children,
}: {
  id: string
  title: string
  note?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="group-label">
        {title}
      </h2>
      <dl className="inset-group inset-rows">{children}</dl>
      {note ? (
        <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
          {note}
        </p>
      ) : null}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
      <dt>{label}</dt>
      <dd className="text-muted-foreground tabular-nums">{value}</dd>
    </div>
  )
}
