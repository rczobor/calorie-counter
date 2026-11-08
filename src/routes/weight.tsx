import { createFileRoute, Link } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { LoadingRows } from '@/components/page/loading-content'
import { PageShell } from '@/components/page/page-shell'
import { ConfigMissingState } from '@/components/page/page-states'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import { usePaginatedQuery, useQuery } from '@/features/households/convex-hooks'
import { usePersonSelection } from '@/features/households/use-person-selection'
import {
  RecordWeightDialog,
  type WeightDialogRequest,
  type WeightEntry,
} from '@/features/weight/record-weight-dialog'
import { WeightChart } from '@/features/weight/weight-chart'
import {
  datedLabel,
  formatKg,
  formatKgChange,
  shiftDate,
} from '@/features/weight/weight-format'
import { isConvexConfigured } from '@/integrations/convex/config'
import { toErrorMessage, toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/weight')({
  ssr: false,
  component: WeightPage,
  errorComponent: ({ error, reset }) => (
    <PageShell title="Weight">
      <p role="alert" className="mt-4 text-sm text-destructive">
        Weight could not be loaded: {toErrorMessage(error)}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        Retry
      </Button>
    </PageShell>
  ),
})

// Where the page sits in the app; its back link returns there.
const PARENT = { to: '/', label: 'Today' } as const

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
] as const
const PEOPLE_PAGE_SIZE = 50
const ENTRIES_PAGE_SIZE = 30
const SELECTED_RANGE_CLASS =
  'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:bg-primary/10'

function readLinkedPerson() {
  const linked = new URLSearchParams(window.location.search).get('personId')
  return linked && /^[a-z0-9]{20,64}$/i.test(linked)
    ? (linked as Id<'people'>)
    : undefined
}

function WeightPage() {
  return isConvexConfigured ? <WeightContent /> : <ConfigMissingState />
}

function WeightContent() {
  const { userId } = useDraftPersistenceIdentity()
  const [today, setToday] = useState(() => toLocalDateString(Date.now()))
  // An installed app can resume on a later day, as on Today.
  useEffect(() => {
    function refreshToday() {
      setToday(toLocalDateString(Date.now()))
    }
    document.addEventListener('visibilitychange', refreshToday)
    window.addEventListener('focus', refreshToday)
    return () => {
      document.removeEventListener('visibilitychange', refreshToday)
      window.removeEventListener('focus', refreshToday)
    }
  }, [])
  const [selectedPersonId, setSelectedPersonId] = usePersonSelection(
    userId,
    readLinkedPerson,
  )
  const [rangeDays, setRangeDays] = useState<number>(90)
  const [dialog, setDialog] = useState<WeightDialogRequest | null>(null)
  const people = usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: PEOPLE_PAGE_SIZE },
  )
  // The picker lists everyone, as households are small; load every page.
  const { status: peopleStatus, loadMore: loadMorePeople } = people
  useEffect(() => {
    if (peopleStatus === 'CanLoadMore') loadMorePeople(PEOPLE_PAGE_SIZE)
  }, [peopleStatus, loadMorePeople])
  const loaded = people.results.find((p) => p._id === selectedPersonId)
  // A linked or remembered person may be archived or beyond the first page.
  const pointLoaded = useQuery(
    api.people.get,
    selectedPersonId && !loaded && people.status !== 'LoadingFirstPage'
      ? { personId: selectedPersonId }
      : 'skip',
  )
  const loadingPeople =
    people.status === 'LoadingFirstPage' ||
    (Boolean(selectedPersonId) && !loaded && pointLoaded === undefined)
  // Never fall back to the first person while the chosen one is still loading:
  // Record would save to the wrong person.
  const person = loadingPeople
    ? undefined
    : (loaded ?? pointLoaded ?? people.results[0])
  const personId = person?._id
  const startDate = shiftDate(today, -(rangeDays - 1))
  const range = useQuery(
    api.weight.listRange,
    personId ? { personId, startDate, endDate: today } : 'skip',
  )
  const latest = useQuery(
    api.weight.latestOnOrBefore,
    personId ? { personId, date: today } : 'skip',
  )
  const entries = usePaginatedQuery(
    api.weight.list,
    personId ? { personId } : 'skip',
    { initialNumItems: ENTRIES_PAGE_SIZE },
  )
  const options = [
    ...people.results,
    ...(pointLoaded && !loaded ? [pointLoaded] : []),
  ].map((p) => ({ value: p._id, label: p.name }))
  const canRecord = Boolean(person && !person.archived)
  // Until the first weigh-in, the range, chart and list would only repeat "none".
  // A future-dated entry has no latest weight yet, but must stay editable.
  const hasWeights = latest !== null || entries.results.length > 0

  return (
    <PageShell
      // The person picker shares the title row, so the first weigh-ins stay
      // above the phone tab bar.
      header={
        <>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Weight
          </h1>
          {loadingPeople ? (
            <Skeleton
              className="h-10 w-40"
              role="status"
              aria-label="Loading people"
            />
          ) : options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active people.{' '}
              <Link to="/people" className="underline">
                Add a person
              </Link>
              .
            </p>
          ) : (
            <Select
              className="h-10 min-w-36 border-border bg-transparent hover:bg-input/50 data-[size=default]:h-10"
              options={options}
              value={personId ?? null}
              onValueChange={(value) =>
                value && setSelectedPersonId(value as Id<'people'>)
              }
              placeholder="Select person"
              ariaLabel="Select person"
            />
          )}
        </>
      }
      contentClassName="max-w-3xl"
      breadcrumbs={
        <Breadcrumb className="mb-5">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="inline-flex min-h-8 items-center"
                render={<Link to={PARENT.to} />}
              >
                {PARENT.label}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Weight</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <div className="mt-4 space-y-5">
        {person ? (
          <section
            aria-label={`${person.name}’s weight`}
            className="rounded-xl border bg-card p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <WeightSummary
                latest={latest}
                today={today}
                archived={person.archived}
              />
              {canRecord ? (
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() => setDialog({ kind: 'new', date: today })}
                >
                  <Plus />
                  Record weight
                </Button>
              ) : null}
            </div>
            {hasWeights ? (
              <>
                <div
                  role="group"
                  aria-label="Range"
                  className="mt-4 flex flex-wrap gap-2"
                >
                  {RANGES.map(({ days, label }) => (
                    <Button
                      key={days}
                      variant="outline"
                      size="sm"
                      aria-pressed={rangeDays === days}
                      className={cn(
                        'h-10 px-3 text-sm',
                        rangeDays === days && SELECTED_RANGE_CLASS,
                      )}
                      onClick={() => setRangeDays(days)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <RangeChange range={range} />
                <div className="mt-2">
                  {range === undefined ? (
                    <Skeleton
                      className="h-38 w-full md:h-46"
                      role="status"
                      aria-label="Loading weight trend"
                    />
                  ) : (
                    <WeightChart
                      entries={range}
                      endDate={today}
                      today={today}
                    />
                  )}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {person && hasWeights ? (
          <section aria-labelledby="weight-entries-heading">
            <h2 id="weight-entries-heading" className="font-semibold">
              Weigh-ins
            </h2>
            <p className="text-sm text-muted-foreground">
              Change from the previous weigh-in.
            </p>
            {entries.status === 'LoadingFirstPage' ? (
              <LoadingRows label="Loading weigh-ins" rows={3} />
            ) : (
              <ul className="mt-2 divide-y border-y border-border/60">
                {entries.results.map((entry, index) => (
                  <li key={entry._id}>
                    <EntryRow
                      entry={entry}
                      older={entries.results[index + 1]}
                      today={today}
                      onOpen={
                        canRecord
                          ? () => setDialog({ kind: 'edit', entry })
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
            {entries.status === 'CanLoadMore' ||
            entries.status === 'LoadingMore' ? (
              <Button
                className="mt-3"
                variant="outline"
                disabled={entries.status === 'LoadingMore'}
                aria-busy={entries.status === 'LoadingMore'}
                onClick={() => entries.loadMore(ENTRIES_PAGE_SIZE)}
              >
                Load older weigh-ins
              </Button>
            ) : null}
          </section>
        ) : null}
      </div>
      {dialog && person ? (
        <RecordWeightDialog
          personId={person._id}
          personName={person.name}
          today={today}
          request={dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </PageShell>
  )
}

function WeightSummary({
  latest,
  today,
  archived,
}: {
  latest: WeightEntry | null | undefined
  today: string
  archived: boolean
}) {
  if (latest === undefined)
    return (
      <div role="status" aria-label="Loading latest weight">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="mt-3 h-5 w-52" />
      </div>
    )
  if (latest === null)
    return (
      <div>
        <p className="text-lg font-semibold">No weigh-ins yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {archived
            ? 'This person is archived.'
            : 'Optional. Record a weight whenever you like. Once there are a few, the trend shows here.'}
        </p>
      </div>
    )
  return (
    <div>
      <p className="tabular-nums">
        <span className="text-5xl font-semibold tracking-tight">
          {formatKg(latest.weightKg)}
        </span>{' '}
        <span className="ml-0.5 text-base text-muted-foreground">kg</span>
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {datedLabel(latest.measuredOn, today)}
      </p>
    </div>
  )
}

// Neutral on purpose: some people want to lose weight, others to gain it.
function RangeChange({ range }: { range: WeightEntry[] | undefined }) {
  const first = range?.[0]
  const last = range?.at(-1)
  if (!first || !last || first === last)
    return <p className="mt-3 h-5" aria-hidden="true" />
  const change = Math.round((last.weightKg - first.weightKg) * 10) / 10
  const since = format(parseISO(first.measuredOn), 'MMM d')
  const Icon =
    change === 0 ? ArrowRight : change < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <p className="mt-3 flex items-center gap-1 text-sm tabular-nums">
      <Icon aria-hidden="true" className="size-4" />
      {change === 0
        ? `No change since ${since}`
        : `${formatKgChange(change)} kg since ${since}`}
    </p>
  )
}

function EntryRow({
  entry,
  older,
  today,
  onOpen,
}: {
  entry: WeightEntry
  older?: WeightEntry
  today: string
  onOpen?: () => void
}) {
  const content = (
    <>
      <span className="min-w-0 flex-1 text-left">
        {datedLabel(entry.measuredOn, today)}
      </span>
      {older ? (
        <span className="w-20 text-right text-[0.8125rem] text-muted-foreground tabular-nums">
          {Math.round((entry.weightKg - older.weightKg) * 10) === 0
            ? 'No change'
            : `${formatKgChange(entry.weightKg - older.weightKg)} kg`}
        </span>
      ) : null}
      <span className="w-20 text-right font-medium tabular-nums">
        {formatKg(entry.weightKg)}{' '}
        <span className="text-xs font-normal text-muted-foreground">kg</span>
      </span>
    </>
  )
  if (!onOpen)
    return <div className="flex items-center gap-3 py-3 text-sm">{content}</div>
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 py-3 text-sm hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
      aria-label={`${datedLabel(entry.measuredOn, today)}: ${formatKg(entry.weightKg)} kg. Edit`}
      onClick={onOpen}
    >
      {content}
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  )
}
