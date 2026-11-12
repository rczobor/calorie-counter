import { Drawer } from '@base-ui/react/drawer'
import { parseISO } from 'date-fns'
import type { FunctionReturnType } from 'convex/server'
import { ArrowRight, Check, ChevronRight, Info, X } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import {
  Area,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import {
  CHECK_IN_DAYS,
  MIN_GOAL_KCAL,
  MIN_LOGGED_DAYS,
  MIN_WEIGH_IN_SPAN_DAYS,
  MIN_WEIGH_INS,
  roundKcal,
} from '../../../convex/lib/energy'
import { Value } from '@/components/nutrition/value'
import { Sheet } from '@/components/page/sheet'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMarkHintSeen } from '@/features/hints/hints'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { dayLabel, formatMonthDay } from '@/features/weight/weight-format'
import { formatAmount } from '@/i18n/format'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { toErrorMessage } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import {
  closeness,
  currentGoalLine,
  describePlan,
  formatKgPerWeek,
} from './energy-format'
import { messages } from './maintenance-card.messages'

type Person = FunctionReturnType<typeof api.people.list>['page'][number]
type CheckIn = NonNullable<FunctionReturnType<typeof api.energy.checkIn>>

/** A suggestion this close to the goal is noise, not a reason to change it. */
const SUGGEST_FROM_KCAL = 50

/**
 * The Weight page's check-in: maintenance measured from the person's own logs
 * and weigh-ins, and the goal that keeps their plan on pace. It only suggests;
 * the goal changes when someone taps Update goal.
 */
export function MaintenanceCard({
  person,
  today,
  onOpenCalculator,
}: {
  person: Person
  today: string
  onOpenCalculator: () => void
}) {
  const t = useMessages(messages)
  const checkIn = useQuery(api.energy.checkIn, {
    personId: person._id,
    today,
  })
  // Only your own estimate is what your Today hint announces.
  const ready =
    person.linkedAccount === 'you' && checkIn?.estimate.status === 'ready'
  const markHintSeen = useMarkHintSeen()
  // Seeing the measured maintenance here is what Today's hint points to.
  useEffect(() => {
    if (ready) markHintSeen('maintenance')
  }, [ready, markHintSeen])
  // Another member's person: the check-in is built from their private weight.
  if (checkIn === null) return null
  return (
    <section
      aria-labelledby="maintenance-heading"
      className="inset-group px-4 py-4"
    >
      {checkIn === undefined ? (
        <div role="status" aria-label={t.loading}>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-9 w-48" />
          <Skeleton className="mt-3 h-4 w-60" />
        </div>
      ) : checkIn.estimate.status === 'learning' ? (
        <Learning
          person={person}
          checkIn={checkIn}
          onOpenCalculator={onOpenCalculator}
        />
      ) : (
        <Ready
          person={person}
          checkIn={checkIn}
          today={today}
          onOpenCalculator={onOpenCalculator}
        />
      )}
    </section>
  )
}

function Heading({ badge }: { badge: ReactNode }) {
  const t = useMessages(messages)
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id="maintenance-heading" className="type-headline">
        {t.heading}
      </h2>
      {badge}
    </div>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: 'ready' | 'quiet'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 type-caption font-semibold',
        tone === 'ready'
          ? 'bg-muted text-foreground'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {tone === 'ready' ? (
        <Check aria-hidden="true" className="size-3" />
      ) : null}
      {children}
    </span>
  )
}

function Progress({
  label,
  value,
  of,
}: {
  label: string
  value: number
  of: number
}) {
  const t = useMessages(messages)
  const shown = Math.min(value, of)
  return (
    <div>
      <div className="flex justify-between type-subhead">
        <span>{label}</span>
        <span className="font-medium tabular-nums">
          {t.progress(shown, of)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={of}
        aria-valuenow={shown}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(shown / of) * 100}%` }}
        />
      </div>
    </div>
  )
}

function Learning({
  person,
  checkIn,
  onOpenCalculator,
}: {
  person: Person
  checkIn: CheckIn
  onOpenCalculator: () => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const { estimate, formula } = checkIn
  const countsMet =
    estimate.loggedDays >= MIN_LOGGED_DAYS && estimate.weighIns >= MIN_WEIGH_INS
  return (
    <>
      <Heading badge={<Badge tone="quiet">{t.learning}</Badge>} />
      <p className="mt-2 type-subhead">{t.appearsAfter(person.name)}</p>
      <div className="mt-4 space-y-3">
        <Progress
          label={t.loggedDays}
          value={estimate.loggedDays}
          of={MIN_LOGGED_DAYS}
        />
        <Progress
          label={t.weighIns}
          value={estimate.weighIns}
          of={MIN_WEIGH_INS}
        />
      </div>
      {countsMet && estimate.weighInSpanDays < MIN_WEIGH_IN_SPAN_DAYS ? (
        <p className="mt-3 type-footnote text-muted-foreground">
          {t.spanTwoWeeks}
        </p>
      ) : null}
      <div className="mt-4 border-t border-border pt-4">
        {person.goalPlan ? (
          <dl className="space-y-1.5 type-subhead tabular-nums">
            {formula ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t.formulaGuess}</dt>
                <dd className="font-medium whitespace-nowrap">
                  {t.approxPerDay(roundKcal(formula.kcal))}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">
                {t.currentGoal}
                <span className="block type-footnote">
                  {describePlan(person.goalPlan, locale)}
                </span>
              </dt>
              <dd className="font-medium whitespace-nowrap">
                {t.perDay(Math.round(person.currentDailyGoalKcal))}
              </dd>
            </div>
          </dl>
        ) : (
          <SetUpPlan person={person} onOpenCalculator={onOpenCalculator} />
        )}
        {person.goalPlan ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onOpenCalculator}
          >
            {t.editPlan}
          </Button>
        ) : null}
      </div>
      <p className="mt-4 flex gap-2 type-footnote text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {/* With no weigh-ins, the card above already asks for one. */}
          {checkIn.latestWeightKg === null ? '' : t.weighInTip}
          {t.daysLeftOut}
        </span>
      </p>
    </>
  )
}

function SetUpPlan({
  person,
  onOpenCalculator,
}: {
  person: Person
  onOpenCalculator: () => void
}) {
  const t = useMessages(messages)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="min-w-0 flex-1 type-subhead text-muted-foreground">
        {person.energyProfile ? t.choosePace : t.addDetails}
      </p>
      <Button variant="outline" size="sm" onClick={onOpenCalculator}>
        {t.findGoal}
      </Button>
    </div>
  )
}

function Ready({
  person,
  checkIn,
  today,
  onOpenCalculator,
}: {
  person: Person
  checkIn: CheckIn
  today: string
  onOpenCalculator: () => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const { estimate, formula, suggestion, history } = checkIn
  const updateGoal = useMutation(api.nutrition.updatePersonGoal)
  const updatePerson = useMutation(api.nutrition.updatePerson)
  const [pending, setPending] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  if (estimate.status !== 'ready') return null
  const maintenance = roundKcal(estimate.maintenance.kcal)
  const low = roundKcal(
    estimate.maintenance.kcal - estimate.maintenance.uncertaintyKcal,
  )
  const high = roundKcal(
    estimate.maintenance.kcal + estimate.maintenance.uncertaintyKcal,
  )
  const plan = person.goalPlan
  const current = Math.round(person.currentDailyGoalKcal)
  // A plan that has to stop always offers the update, since it ends the plan.
  const endsPlan = Boolean(
    suggestion?.targetReached || suggestion?.belowHealthyWeight,
  )
  const change =
    suggestion &&
    (endsPlan || Math.abs(suggestion.goalKcal - current) >= SUGGEST_FROM_KCAL)
  const skipped = estimate.incompleteDays

  async function update() {
    if (!suggestion) return
    setPending(true)
    try {
      const goalChange = {
        personId: person._id,
        expectedEditRevision: person.editRevision,
        goalKcal: suggestion.goalKcal,
        effectiveDate: today,
        reason: t.checkInReason(maintenance),
      }
      // Ending a plan updates it too, so the card and People say so.
      if (endsPlan)
        await updatePerson({
          ...goalChange,
          name: person.name,
          goalPlan: { direction: 'maintain' },
        })
      else await updateGoal(goalChange)
      toast.success(t.goalUpdated)
      setDetailsOpen(false)
    } catch (failure) {
      toast.error(toErrorMessage(failure, locale))
    } finally {
      setPending(false)
    }
  }

  const reason =
    suggestion && plan
      ? suggestionReason({
          locale,
          name: person.name,
          plan,
          targetReached: suggestion.targetReached,
          belowHealthyWeight: suggestion.belowHealthyWeight,
          plannedKgPerWeek: suggestion.kgPerWeek,
          trendKgPerWeek: estimate.trendKgPerWeek,
          maintenanceKcal: maintenance,
          goalKcal: suggestion.goalKcal,
        })
      : null
  const heldAt =
    suggestion?.heldAtMinimum && person.energyProfile
      ? MIN_GOAL_KCAL[person.energyProfile.sex]
      : null

  // "2000 → 1730 kcal a day": the goal now, muted, then the suggestion.
  const suggested = suggestion ? (
    <p className="tabular-nums">
      {change ? (
        <>
          <span className="sr-only">{t.now(current)}, </span>
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1 pr-1.5 type-subhead text-muted-foreground"
          >
            {current}
            <ArrowRight className="size-3.5" />
          </span>
        </>
      ) : null}
      <span className="type-title font-semibold">{suggestion.goalKcal}</span>{' '}
      <span className="type-subhead text-muted-foreground">{t.kcalADay}</span>
    </p>
  ) : null
  const updateButton = (
    <Button size="sm" disabled={pending} onClick={() => void update()}>
      {t.updateGoal}
    </Button>
  )

  // The card carries the one decision; how the estimate and the suggestion
  // were worked out is a tap away, in a sheet.
  return (
    <>
      <h2 id="maintenance-heading">
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={() => setDetailsOpen(true)}
          className="-mx-2 -my-1.5 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring active:bg-accent"
        >
          <span className="min-w-0 flex-1 type-headline">{t.heading}</span>{' '}
          <span className="whitespace-nowrap tabular-nums">
            {/* Regular weight, so the suggested goal is the card's one bold
                figure and this never reads as the goal. */}
            ≈ {maintenance}{' '}
            <span className="type-subhead text-muted-foreground">
              {t.kcalADay}
            </span>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        </button>
      </h2>
      <div className="mt-3 border-t border-border pt-3">
        {suggestion && plan ? (
          change ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="type-subhead text-muted-foreground">
                    {t.suggestedGoal}
                  </h3>
                  {suggested}
                </div>
                {updateButton}
              </div>
              {/* Updating also ends the plan, so why stays in view. */}
              {endsPlan ? (
                <p className="mt-2 type-footnote text-muted-foreground">
                  {reason}
                </p>
              ) : null}
              {heldAt !== null ? (
                <p className="mt-1 type-footnote text-caution">
                  {t.heldAtMinimum(heldAt)}
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="type-subhead tabular-nums">
                <span className="text-muted-foreground">{t.goal}</span>{' '}
                <span className="font-medium">{t.perDay(current)}</span>
              </p>
              <Badge tone="ready">{t.onTrack}</Badge>
            </div>
          )
        ) : (
          <SetUpPlan person={person} onOpenCalculator={onOpenCalculator} />
        )}
      </div>
      {detailsOpen ? (
        <Sheet
          onClose={() => setDetailsOpen(false)}
          pending={pending}
          className="max-h-[85dvh] md:max-w-lg"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-2 pb-2 pl-4 md:pt-3">
            <Drawer.Title className="min-w-0 truncate type-title">
              {t.heading}
            </Drawer.Title>
            <Drawer.Close
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  aria-label={t.close}
                />
              }
            >
              <X />
            </Drawer.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <p className="tabular-nums">
              {/* Regular weight here too: the suggested goal is the bold
                  figure, at the end of the working. */}
              <span className="type-title font-normal">≈ {maintenance}</span>{' '}
              <span className="type-subhead text-muted-foreground">
                {t.kcalADay}
              </span>
            </p>
            <p className="mt-1 type-footnote text-muted-foreground tabular-nums">
              {t.likely(
                low,
                high,
                closeness(estimate.maintenance.uncertaintyKcal, locale),
                // The chart labels the formula's guess when it shows.
                formula && history.length <= 1 ? roundKcal(formula.kcal) : null,
              )}
            </p>
            {history.length > 1 ? (
              <EstimateChart
                history={history}
                formulaKcal={formula?.kcal}
                today={today}
              />
            ) : null}
            <dl className="mt-4 divide-y divide-border border-y border-border type-subhead tabular-nums">
              <Stat
                label={t.averageIntake}
                value={
                  <Value
                    value={Math.round(estimate.averageIntakeKcal)}
                    unit={t.kcalADay}
                    size="child"
                  />
                }
              />
              <Stat
                label={t.weightTrend}
                value={
                  <Value
                    value={signedKgFigure(estimate.trendKgPerWeek, locale)}
                    unit={t.kgAWeek}
                    size="child"
                  />
                }
              />
              {plan && plan.direction !== 'maintain' && suggestion ? (
                <Stat
                  label={t.plan}
                  value={
                    <Value
                      value={signedKgFigure(suggestion.kgPerWeek, locale)}
                      unit={t.kgAWeek}
                      size="child"
                    />
                  }
                />
              ) : null}
            </dl>
            <p className="mt-3 type-footnote text-muted-foreground">
              {t.basis(
                estimate.loggedDays,
                estimate.weighIns,
                CHECK_IN_DAYS / 7,
              )}
              {skipped.length > 0
                ? t.skipped(
                    skipped
                      .slice(0, 3)
                      .map((day) =>
                        t.skippedDay(
                          formatMonthDay(parseISO(day.date), locale),
                          Math.round(day.kcal),
                        ),
                      )
                      .join(', '),
                    skipped.length - 3,
                  )
                : ''}
            </p>
            {/* The working ends with how the suggestion follows from it; then,
                under the rule, the same decision as the card. */}
            {suggestion && plan ? (
              <>
                <p className="mt-3 type-footnote text-muted-foreground tabular-nums">
                  {reason}
                  {/* A change already shows the current goal beside it. */}
                  {change
                    ? null
                    : ` ${currentGoalLine(current, suggestion.goalKcal, locale)}.`}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <div className="min-w-0">
                    <h3 className="type-subhead text-muted-foreground">
                      {t.suggestedGoal}
                    </h3>
                    {suggested}
                  </div>
                  {change ? updateButton : null}
                </div>
                {heldAt !== null ? (
                  <p className="mt-1 type-footnote text-caution">
                    {t.heldAtMinimum(heldAt)}
                  </p>
                ) : null}
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      setDetailsOpen(false)
                      onOpenCalculator()
                    }}
                  >
                    {t.editPlan}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  )
}

/** Within this of the plan, the trend counts as on pace. */
const ON_PACE_KG_PER_WEEK = 0.05

/** What the suggestion aims for, and how the trend compares with the plan. */
function suggestionReason({
  locale,
  name,
  plan,
  targetReached,
  belowHealthyWeight,
  plannedKgPerWeek,
  trendKgPerWeek,
  maintenanceKcal,
  goalKcal,
}: {
  locale: Locale
  name: string
  plan: NonNullable<Person['goalPlan']>
  targetReached: boolean
  belowHealthyWeight: boolean
  plannedKgPerWeek: number
  trendKgPerWeek: number
  maintenanceKcal: number
  goalKcal: number
}) {
  const t = messages[locale]
  if (
    targetReached &&
    plan.direction !== 'maintain' &&
    plan.targetWeightKg !== undefined
  )
    return t.targetReached(name, formatAmount(plan.targetWeightKg, locale))
  if (belowHealthyWeight) return t.belowHealthyWeight(name)
  const gap = trendKgPerWeek - plannedKgPerWeek
  const step = goalKcal - maintenanceKcal
  // The working, as in the calculator: maintenance plus or minus the plan.
  const aim =
    plan.direction === 'maintain'
      ? t.aimMaintain
      : t.aim(
          maintenanceKcal,
          `${step < 0 ? '−' : '+'} ${Math.abs(step)}`,
          plan.direction,
          formatAmount(plan.percentPerWeek, locale),
          // The same plan in kilograms, as the Plan row above shows it.
          formatKgPerWeek(plannedKgPerWeek, locale),
        )
  if (Math.abs(gap) < ON_PACE_KG_PER_WEEK) return t.onPace(aim)
  if (plan.direction === 'maintain') return t.weightMoving(aim, gap < 0)
  // Losing: a trend above the (negative) plan is slower. Gaining: the reverse.
  const slower = plan.direction === 'lose' ? gap > 0 : gap < 0
  return t.trendPace(aim, slower)
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

/** "−0.16", "+0.20": a weekly change in kilograms with a true minus sign. */
function signedKgFigure(kg: number, locale: Locale) {
  if (Math.round(kg * 100) === 0) return '0'
  return `${kg < 0 ? '−' : '+'}${formatKgPerWeek(kg, locale)}`
}

const estimateConfig = {
  estimate: { color: 'var(--chart-3)' },
} satisfies ChartConfig

/**
 * The weekly estimates with their likely range, narrowing as data builds up,
 * against the formula's guess as a dashed line. The first and latest
 * estimates carry their figures on the side away from the formula line;
 * touch or hover shows any week's.
 */
function EstimateChart({
  history,
  formulaKcal,
  today,
}: {
  history: CheckIn['history']
  formulaKcal?: number
  today: string
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const fillId = `estimate-fill-${useId().replace(/:/g, '')}`
  // A figure sits below its point when the formula line is above it.
  const below = (kcal: number) =>
    formulaKcal !== undefined && kcal < formulaKcal
  const data = history.map((point) => {
    const range = [
      point.kcal - point.uncertaintyKcal,
      point.kcal + point.uncertaintyKcal,
    ]
    return {
      t: parseISO(point.date).getTime(),
      date: point.date,
      kcal: point.kcal,
      range,
      // Where a figure goes: just outside the shading, away from the formula.
      edge: below(point.kcal) ? range[0] : range[1],
    }
  })
  const values = data.flatMap((point) => point.range)
  if (formulaKcal !== undefined) values.push(formulaKcal)
  const first = data[0]
  const last = data[data.length - 1]
  // The first and latest figures share one baseline when they sit on the
  // same side: just past whichever end's shading reaches further.
  if (data.length > 1 && below(first.kcal) === below(last.kcal)) {
    const edge = below(first.kcal)
      ? Math.min(first.range[0], last.range[0])
      : Math.max(first.range[1], last.range[1])
    first.edge = edge
    last.edge = edge
  }
  // Extra room on the side that carries the figures.
  const roomBelow = below(first.kcal) || below(last.kcal)
  const roomAbove = !below(first.kcal) || !below(last.kcal)
  // Room for a row of figures (or the formula's label) on each side.
  const low = Math.min(...values) - (roomBelow ? 80 : 30)
  const high = Math.max(...values) + (roomAbove ? 80 : 50)
  const day = (date: string) => formatMonthDay(parseISO(date), locale)
  return (
    <figure className="mt-4 select-none">
      <figcaption className="sr-only">
        {t.chartLabel(
          { kcal: roundKcal(first.kcal), day: day(first.date) },
          { kcal: roundKcal(last.kcal), day: day(last.date) },
          formulaKcal !== undefined ? roundKcal(formulaKcal) : null,
        )}
      </figcaption>
      <ChartContainer
        config={estimateConfig}
        className="aspect-auto h-40 w-full"
        aria-hidden="true"
      >
        <ComposedChart
          // Hidden from assistive technology, which reads the summary
          // instead, so the chart takes no keyboard focus either.
          accessibilityLayer={false}
          data={data}
          // The plot shares the sheet's text column.
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-estimate)"
                className="[stop-opacity:0.22] dark:[stop-opacity:0.36]"
              />
              <stop
                offset="100%"
                stopColor="var(--color-estimate)"
                className="[stop-opacity:0.12] dark:[stop-opacity:0.22]"
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[first.t, last.t]}
            ticks={data.map((point) => point.t)}
            // Room for the end dots; the end dates still start and end on
            // the text column.
            padding={{ left: 6, right: 6 }}
            tickLine={false}
            axisLine={false}
            tickMargin={2}
            interval={0}
            tick={({ x, y, payload }) => {
              const value = Number(payload.value)
              return (
                <text
                  x={x}
                  y={y}
                  dx={value === first.t ? -6 : value === last.t ? 6 : 0}
                  dy={8}
                  textAnchor={
                    value === first.t
                      ? 'start'
                      : value === last.t
                        ? 'end'
                        : 'middle'
                  }
                  style={{ fill: 'var(--muted-foreground)' }}
                >
                  {value === last.t
                    ? dayLabel(last.date, today, locale)
                    : formatMonthDay(value, locale)}
                </text>
              )
            }}
          />
          <YAxis hide domain={[low, high]} />
          {formulaKcal !== undefined ? (
            <ReferenceLine
              // From the first week to the latest, like the estimates.
              segment={[
                { x: first.t, y: formulaKcal },
                { x: last.t, y: formulaKcal },
              ]}
              // Dotted: in this chart family, dashes mean a pause in data,
              // and a solid rule would read as a divider.
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="0 4"
              strokeLinecap="round"
              // On the text column, on the side away from the estimates.
              label={({ viewBox }) =>
                viewBox && 'x' in viewBox ? (
                  <text
                    x={viewBox.x}
                    y={Number(viewBox.y)}
                    // Back onto the text column from the first week's dot.
                    dx={-6}
                    dy={below(first.kcal) ? -6 : 14}
                    style={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  >
                    {t.formula(roundKcal(formulaKcal))}
                  </text>
                ) : null
              }
            />
          ) : null}
          <ChartTooltip
            cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => {
                  const date = (
                    payload?.[0]?.payload as (typeof data)[number] | undefined
                  )?.date
                  return date ? day(date) : null
                }}
                formatter={(value) => (
                  <span className="type-subhead font-semibold text-foreground tabular-nums">
                    ≈ {roundKcal(Number(value))}{' '}
                    <span className="font-normal text-muted-foreground">
                      {t.kcalADay}
                    </span>
                  </span>
                )}
              />
            }
          />
          <Area
            dataKey="range"
            type="linear"
            stroke="none"
            fill={`url(#${fillId})`}
            tooltipType="none"
            animationDuration={400}
            activeDot={false}
          />
          <Line
            dataKey="kcal"
            type="linear"
            stroke="var(--color-estimate)"
            strokeWidth={2}
            strokeLinejoin="round"
            animationDuration={400}
            dot={({ cx, cy, index }) => (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={index === data.length - 1 ? 4 : 2.5}
                fill="var(--color-estimate)"
              />
            )}
            activeDot={{
              r: 5,
              fill: 'var(--color-estimate)',
              stroke: 'var(--background)',
              strokeWidth: 2,
            }}
          />
          {/* An unseen line along the shading's edge carries the first and
              latest figures, so they sit clear of the band. */}
          <Line
            dataKey="edge"
            stroke="none"
            dot={false}
            activeDot={false}
            tooltipType="none"
            isAnimationActive={false}
          >
            <LabelList
              dataKey="edge"
              content={({ x, y, index }) => {
                if (index !== 0 && index !== data.length - 1) return null
                const point = data[index]
                const latest = index === data.length - 1
                return (
                  <text
                    x={Number(x)}
                    y={Number(y)}
                    dx={latest ? 6 : -6}
                    dy={below(point.kcal) ? 22 : -11}
                    textAnchor={latest ? 'end' : 'start'}
                    className="tabular-nums"
                    style={{
                      fill: 'var(--foreground)',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {roundKcal(point.kcal)}
                  </text>
                )
              }}
            />
          </Line>
        </ComposedChart>
      </ChartContainer>
    </figure>
  )
}
