import {
  createFileRoute,
  Link,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Lock,
  Plus,
} from 'lucide-react'
import type { UsePaginatedQueryReturnType } from 'convex/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { api } from '../../convex/_generated/api'
import { CHECK_IN_DAYS } from '../../convex/lib/energy'
import type { Id } from '../../convex/_generated/dataModel'
import { Value } from '@/components/nutrition/value'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { LoadingRows } from '@/components/page/loading-content'
import { PageShell } from '@/components/page/page-shell'
import { ConfigMissingState } from '@/components/page/page-states'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { Button } from '@/components/ui/button'
import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import { Skeleton } from '@/components/ui/skeleton'
import { useDraftPersistenceIdentity } from '@/features/cooking/draft-persistence-identity'
import { GoalCalculator } from '@/features/energy/goal-calculator'
import { MaintenanceCard } from '@/features/energy/maintenance-card'
import {
  useMutation,
  usePaginatedQuery,
  useQuery,
} from '@/features/households/convex-hooks'
import { PersonPicker } from '@/features/households/person-picker'
import { usePersonSelection } from '@/features/households/use-person-selection'
import { youFirst } from '@/features/households/you-first'
import {
  RecordWeightDialog,
  type WeightDialogRequest,
  type WeightEntry,
} from '@/features/weight/record-weight-dialog'
import {
  WeightChart,
  type ScrubbedWeight,
} from '@/features/weight/weight-chart'
import {
  datedLabel,
  formatKg,
  formatKgChange,
  shiftDate,
} from '@/features/weight/weight-format'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isConvexConfigured } from '@/integrations/convex/config'
import { formatDate } from '@/lib/dates'
import { toErrorMessage, toLocalDateString } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { messages } from './weight.messages'

export const Route = createFileRoute('/weight')({
  ssr: false,
  component: WeightPage,
  errorComponent: WeightError,
})

function WeightError({ error, reset }: ErrorComponentProps) {
  const t = useMessages(messages)
  const locale = useLocale()
  return (
    <PageShell title={t.title}>
      <p role="alert" className="mt-4 text-sm text-destructive">
        {t.loadFailed(toErrorMessage(error, locale))}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        {t.retry}
      </Button>
    </PageShell>
  )
}

const RANGES = [30, 90, 365] as const
const PEOPLE_PAGE_SIZE = 50
/** The chart shows the trend, so the list starts with only the latest few. */
const RECENT_WEIGH_INS = 10
const ENTRIES_PAGE_SIZE = 30

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
  const t = useMessages(messages)
  const locale = useLocale()
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
  // The weigh-in under a finger or pointer on the chart, shown in place of
  // the latest weight until it lifts or leaves.
  const [scrubbed, setScrubbed] = useState<ScrubbedWeight | null>(null)
  const [dialog, setDialog] = useState<WeightDialogRequest | null>(null)
  const [calculating, setCalculating] = useState(false)
  const updatePerson = useMutation(api.nutrition.updatePerson)
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
    : (loaded ?? pointLoaded ?? youFirst(people.results)[0])
  // Another member's person: their weight is private, so nothing is read.
  const isPrivate = person?.linkedAccount === 'other'
  const linkedToMe = useQuery(api.people.linkedToMe, isPrivate ? {} : 'skip')
  const personId = person?._id
  const weightPersonId = isPrivate ? undefined : personId
  const startDate = shiftDate(today, -(rangeDays - 1))
  const range = useQuery(
    api.weight.listRange,
    weightPersonId
      ? { personId: weightPersonId, startDate, endDate: today }
      : 'skip',
  )
  // The trend is fitted over the CHECK_IN_DAYS up to each day, so it also
  // reads the weigh-ins that long before the range; only the range is drawn.
  // A separate read, as one range may span at most MAX_HISTORY_DAYS.
  const leadIn = useQuery(
    api.weight.listRange,
    weightPersonId
      ? {
          personId: weightPersonId,
          startDate: shiftDate(startDate, -(CHECK_IN_DAYS - 1)),
          endDate: shiftDate(startDate, -1),
        }
      : 'skip',
  )
  const history = range && leadIn ? [...leadIn, ...range] : range
  const latest = useQuery(
    api.weight.latestOnOrBefore,
    weightPersonId ? { personId: weightPersonId, date: today } : 'skip',
  )
  const entries = usePaginatedQuery(
    api.weight.list,
    weightPersonId ? { personId: weightPersonId } : 'skip',
    // One more than is shown, so the last row has a change to show.
    { initialNumItems: RECENT_WEIGH_INS + 1 },
  )
  const options = youFirst([
    ...people.results,
    ...(pointLoaded && !loaded ? [pointLoaded] : []),
  ]).map((p) => ({
    value: p._id,
    label: p.name,
    you: p.linkedAccount === 'you',
  }))
  const canRecord = Boolean(person && !person.archived && !isPrivate)
  // Until the first weigh-in, the range, chart and list would only repeat "none".
  // A future-dated entry has no latest weight yet, but must stay editable.
  const hasWeights =
    !isPrivate && (latest !== null || entries.results.length > 0)
  // The check-in follows the trend; before any weigh-in it shows only for a
  // person who has started a plan, as the way back to it.
  const maintenance =
    person && !person.archived && !isPrivate ? (
      <MaintenanceCard
        person={person}
        today={today}
        onOpenCalculator={() => setCalculating(true)}
      />
    ) : null

  return (
    <PageShell
      // The person picker shares the title row, so the first weigh-ins stay
      // above the phone tab bar.
      header={
        <>
          <h1 className="type-large-title text-foreground">{t.title}</h1>
          {loadingPeople ? (
            <Skeleton
              className="h-10 w-28 rounded-full"
              role="status"
              aria-label={t.loadingPeople}
            />
          ) : options.length === 0 ? (
            <p className="type-subhead text-muted-foreground">
              {t.noActivePeople}{' '}
              <Link
                to="/people"
                className="font-medium text-foreground underline underline-offset-4"
              >
                {t.addPerson}
              </Link>
              .
            </p>
          ) : (
            <PersonPicker
              options={options}
              value={personId ?? null}
              onValueChange={(value) => value && setSelectedPersonId(value)}
            />
          )}
        </>
      }
      contentClassName="max-w-3xl"
      breadcrumbs={
        // Weight sits under Today; its back link returns there.
        <SettingsBreadcrumbs
          root={{ label: t.today, link: <Link to="/" /> }}
          current={t.title}
        />
      }
    >
      <div className="mt-4 space-y-5">
        {person ? (
          // The primary action sits in the summary, so it is there before the
          // first weigh-in too. Once there are weights, the same card holds
          // the trend, so the latest weight and its direction read together.
          <section
            aria-label={t.personWeight(person.name)}
            className="inset-group px-4 py-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              {isPrivate ? (
                <div className="min-w-0 basis-60 grow">
                  <p className="flex items-center gap-2 type-headline">
                    <Lock
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    {t.privateTitle(person.name)}
                  </p>
                  <p className="mt-1 type-subhead text-pretty text-muted-foreground">
                    {t.privateBody(person.name)}
                  </p>
                  {/* Not a dead end: your own weight is one tap away. */}
                  {linkedToMe ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setSelectedPersonId(linkedToMe)}
                    >
                      {t.yourWeight}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <WeightSummary
                  latest={latest}
                  scrubbed={scrubbed}
                  today={today}
                  archived={person.archived}
                />
              )}
              {canRecord ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialog({ kind: 'new', date: today })}
                >
                  <Plus />
                  {t.recordWeight}
                </Button>
              ) : null}
            </div>
            {hasWeights ? (
              <div className="mt-4">
                <RangeChange range={range} scrubbed={scrubbed} />
                <div className="mt-2">
                  {range === undefined ? (
                    <Skeleton
                      className="h-44 w-full md:h-52"
                      role="status"
                      aria-label={t.loadingTrend}
                    />
                  ) : (
                    <WeightChart
                      entries={range}
                      history={history}
                      endDate={today}
                      today={today}
                      onScrub={setScrubbed}
                    />
                  )}
                </div>
                {/* The range drives the change line and chart above it. */}
                <SegmentedTrack className="mt-4">
                  <div
                    role="group"
                    aria-label={t.range}
                    className={SEGMENT_LIST_CLASS}
                  >
                    {RANGES.map((days) => (
                      <button
                        key={days}
                        type="button"
                        aria-pressed={rangeDays === days}
                        className={SEGMENT_CLASS}
                        onClick={() => setRangeDays(days)}
                      >
                        {t.ranges[days]}
                      </button>
                    ))}
                  </div>
                </SegmentedTrack>
              </div>
            ) : null}
          </section>
        ) : null}

        {person && hasWeights ? (
          <>
            {maintenance}

            <WeighIns
              key={person._id}
              entries={entries}
              today={today}
              onOpen={
                canRecord
                  ? (entry) => setDialog({ kind: 'edit', entry })
                  : undefined
              }
            />
          </>
        ) : person?.energyProfile || person?.goalPlan ? (
          maintenance
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
      {calculating && person && latest !== undefined ? (
        <GoalCalculator
          personName={person.name}
          profile={person.energyProfile}
          plan={person.goalPlan}
          latestWeight={
            latest ? { kg: latest.weightKg, date: latest.measuredOn } : null
          }
          currentGoalKcal={person.currentDailyGoalKcal}
          today={today}
          onClose={() => setCalculating(false)}
          onUse={async (choice) => {
            try {
              await updatePerson({
                personId: person._id,
                expectedEditRevision: person.editRevision,
                name: person.name,
                goalKcal: choice.goalKcal,
                effectiveDate: today,
                reason: choice.reason,
                energyProfile: choice.energyProfile,
                goalPlan: choice.goalPlan,
              })
              toast.success(t.goalUpdated)
              setCalculating(false)
            } catch (failure) {
              toast.error(toErrorMessage(failure, locale))
            }
          }}
        />
      ) : null}
    </PageShell>
  )
}

function WeightSummary({
  latest,
  scrubbed,
  today,
  archived,
}: {
  latest: WeightEntry | null | undefined
  scrubbed: ScrubbedWeight | null
  today: string
  archived: boolean
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  if (latest === undefined)
    return (
      <div role="status" aria-label={t.loadingLatest}>
        <Skeleton className="h-14 w-40" />
        <Skeleton className="mt-2 h-5 w-28" />
      </div>
    )
  if (latest === null)
    return (
      <div className="min-w-0 basis-60 grow">
        <p className="type-headline">{t.noWeighIns}</p>
        <p className="mt-1 type-subhead text-muted-foreground">
          {archived ? t.personArchived : t.optional}
        </p>
      </div>
    )
  // Scrubbing the chart shows that day's weigh-in in place of the latest.
  const shown = scrubbed ?? { kg: latest.weightKg, date: latest.measuredOn }
  return (
    <div>
      <p>
        <Value size="display" value={formatKg(shown.kg, locale)} unit="kg" />
      </p>
      {/* A scrubbed day's date is foreground, so it reads as that day. */}
      <p
        className={cn(
          'mt-1.5 type-subhead',
          scrubbed ? 'font-medium text-foreground' : 'text-muted-foreground',
        )}
      >
        {datedLabel(shown.date, today, locale)}
      </p>
    </div>
  )
}

// Neutral on purpose: some people want to lose weight, others to gain it, so
// the change is foreground with a sign and arrow, never a good or bad colour.
function RangeChange({
  range,
  scrubbed,
}: {
  range: WeightEntry[] | undefined
  scrubbed: ScrubbedWeight | null
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const first = range?.[0]
  const last = range?.at(-1)
  if (!first || !last || first === last)
    return <p className="h-5.5" aria-hidden="true" />
  // While a day is scrubbed, the change is that day's, from the same start,
  // so it always pairs with the weight shown above it.
  const to = scrubbed?.kg ?? last.weightKg
  const change = Math.round((to - first.weightKg) * 10) / 10
  const since = formatDate(first.measuredOn, locale)
  const Icon =
    change === 0 ? ArrowRight : change < 0 ? ArrowDownRight : ArrowUpRight
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 type-subhead text-muted-foreground">
      <Icon aria-hidden="true" className="size-4 text-foreground" />
      {change === 0 ? (
        <span className="type-headline text-foreground">{t.noChange}</span>
      ) : (
        <Value
          size="headline"
          value={formatKgChange(change, locale)}
          unit="kg"
          className="text-foreground"
        />
      )}
      <span>{t.since(since)}</span>
    </p>
  )
}

function WeighIns({
  entries,
  today,
  onOpen,
}: {
  entries: UsePaginatedQueryReturnType<typeof api.weight.list>
  today: string
  onOpen?: (entry: WeightEntry) => void
}) {
  const t = useMessages(messages)
  const [shown, setShown] = useState(RECENT_WEIGH_INS)
  const hasOlder =
    entries.results.length > shown ||
    entries.status === 'CanLoadMore' ||
    entries.status === 'LoadingMore'
  return (
    <section aria-labelledby="weight-entries-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="weight-entries-heading" className="type-title">
          {t.weighIns}
        </h2>
        <p className="type-footnote text-muted-foreground">{t.changeHint}</p>
      </div>
      {entries.status === 'LoadingFirstPage' ? (
        <LoadingRows
          label={t.loadingWeighIns}
          rows={3}
          className="mt-3 inset-group px-4"
        />
      ) : (
        <ul className="mt-3 inset-group inset-rows">
          {/* While older ones load, a row waits for the one after it, so it
              never shows without its change. */}
          {entries.results
            .slice(
              0,
              entries.status === 'LoadingMore'
                ? Math.min(shown, entries.results.length - 1)
                : shown,
            )
            .map((entry, index) => (
              <li key={entry._id}>
                <EntryRow
                  entry={entry}
                  older={entries.results[index + 1]}
                  today={today}
                  onOpen={onOpen ? () => onOpen(entry) : undefined}
                />
              </li>
            ))}
        </ul>
      )}
      {hasOlder ? (
        <Button
          className="mt-3"
          variant="outline"
          size="sm"
          disabled={entries.status === 'LoadingMore'}
          aria-busy={entries.status === 'LoadingMore'}
          onClick={() => {
            setShown((count) => count + ENTRIES_PAGE_SIZE)
            // Loads as many as it reveals, so the spare row loaded first
            // still gives the last shown row its change.
            if (entries.status === 'CanLoadMore')
              entries.loadMore(ENTRIES_PAGE_SIZE)
          }}
        >
          {t.loadOlder}
        </Button>
      ) : null}
    </section>
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
  const t = useMessages(messages)
  const locale = useLocale()
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">
        {datedLabel(entry.measuredOn, today, locale)}
      </span>
      {older ? (
        <span className="shrink-0 text-right type-footnote text-muted-foreground tabular-nums">
          {Math.round((entry.weightKg - older.weightKg) * 10) === 0
            ? t.unchanged
            : `${formatKgChange(entry.weightKg - older.weightKg, locale)} kg`}
        </span>
      ) : null}
      <Value
        value={formatKg(entry.weightKg, locale)}
        unit="kg"
        className="min-w-17 text-right"
      />
    </>
  )
  if (!onOpen)
    return (
      <div className={cn(LIST_ROW_CLASS, 'hover:bg-transparent')}>
        {content}
      </div>
    )
  return (
    <button
      type="button"
      className={LIST_ROW_CLASS}
      aria-label={t.editEntry(
        datedLabel(entry.measuredOn, today, locale),
        formatKg(entry.weightKg, locale),
      )}
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
