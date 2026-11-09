import { parseISO } from 'date-fns'
import type { FunctionReturnType } from 'convex/server'
import { Check, Info } from 'lucide-react'
import { useState, type ReactNode } from 'react'
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
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { formatMonthDay } from '@/features/weight/weight-format'
import { formatAmount } from '@/i18n/format'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { toErrorMessage } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import {
  closeness,
  currentGoalLine,
  describePlan,
  signedKg,
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
    } catch (failure) {
      toast.error(toErrorMessage(failure, locale))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Heading
        badge={
          suggestion ? (
            change ? (
              <Badge tone="ready">{t.checkInReady}</Badge>
            ) : (
              <Badge tone="quiet">{t.onTrack}</Badge>
            )
          ) : null
        }
      />
      <p className="mt-3 tabular-nums">
        <span className="type-title font-semibold">≈ {maintenance}</span>{' '}
        <span className="type-subhead text-muted-foreground">{t.kcalADay}</span>
      </p>
      <p className="mt-1 type-footnote text-muted-foreground tabular-nums">
        {t.likely(
          low,
          high,
          closeness(estimate.maintenance.uncertaintyKcal, locale),
          formula ? roundKcal(formula.kcal) : null,
        )}
      </p>
      {history.length > 1 ? (
        <EstimateChart history={history} formulaKcal={formula?.kcal} />
      ) : null}
      <dl className="mt-4 divide-y divide-border border-y border-border type-subhead tabular-nums">
        <Stat
          label={t.averageIntake}
          value={t.perDay(Math.round(estimate.averageIntakeKcal))}
        />
        <Stat
          label={t.weightTrend}
          value={t.perWeek(signedKg(estimate.trendKgPerWeek, locale))}
        />
        {plan && plan.direction !== 'maintain' && suggestion ? (
          <Stat
            label={t.plan}
            value={t.perWeek(signedKg(suggestion.kgPerWeek, locale))}
          />
        ) : null}
      </dl>
      <p className="mt-3 type-footnote text-muted-foreground">
        {t.basis(estimate.loggedDays, estimate.weighIns, CHECK_IN_DAYS / 7)}
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
      <div className="mt-4 border-t border-border pt-4">
        {suggestion && plan ? (
          <>
            <div className="-mx-2 rounded-xl bg-muted/70 px-3 py-3">
              <h3 className="type-subhead font-semibold">{t.suggestedGoal}</h3>
              <p className="mt-0.5 tabular-nums">
                <span className="type-title font-semibold">
                  {suggestion.goalKcal}
                </span>{' '}
                <span className="type-subhead text-muted-foreground">
                  {t.kcalADay}
                </span>
              </p>
              <p className="type-footnote text-muted-foreground tabular-nums">
                {suggestionReason({
                  locale,
                  name: person.name,
                  plan,
                  targetReached: suggestion.targetReached,
                  belowHealthyWeight: suggestion.belowHealthyWeight,
                  plannedKgPerWeek: suggestion.kgPerWeek,
                  trendKgPerWeek: estimate.trendKgPerWeek,
                  maintenanceKcal: maintenance,
                  goalKcal: suggestion.goalKcal,
                })}{' '}
                {currentGoalLine(current, suggestion.goalKcal, locale)}.
              </p>
              {suggestion.heldAtMinimum && person.energyProfile ? (
                <p className="mt-1 type-footnote text-caution">
                  {t.heldAtMinimum(MIN_GOAL_KCAL[person.energyProfile.sex])}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {change ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => void update()}
                  >
                    {t.updateGoal}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={onOpenCalculator}
                >
                  {t.editPlan}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <SetUpPlan person={person} onOpenCalculator={onOpenCalculator} />
        )}
      </div>
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
        )
  if (Math.abs(gap) < ON_PACE_KG_PER_WEEK) return t.onPace(aim)
  if (plan.direction === 'maintain') return t.weightMoving(aim, gap < 0)
  // Losing: a trend above the (negative) plan is slower. Gaining: the reverse.
  const slower = plan.direction === 'lose' ? gap > 0 : gap < 0
  return t.trendPace(aim, slower)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

/**
 * The weekly estimates with their likely range, narrowing as data builds up,
 * against the formula's guess as a dashed line.
 */
function EstimateChart({
  history,
  formulaKcal,
}: {
  history: CheckIn['history']
  formulaKcal?: number
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const values = history.flatMap((point) => [
    point.kcal - point.uncertaintyKcal,
    point.kcal + point.uncertaintyKcal,
  ])
  if (formulaKcal !== undefined) values.push(formulaKcal)
  const low = Math.min(...values) - 40
  const high = Math.max(...values) + 40
  const days = history.map((point) => parseISO(point.date).getTime())
  const x = (index: number) =>
    ((days[index] - days[0]) / (days[days.length - 1] - days[0])) * 100
  const y = (kcal: number) => ((high - kcal) / (high - low)) * 100
  const upper = history.map(
    (p, i) => `${x(i)},${y(p.kcal + p.uncertaintyKcal)}`,
  )
  const lower = history
    .map((p, i) => `${x(i)},${y(p.kcal - p.uncertaintyKcal)}`)
    .reverse()
  const first = history[0]
  const last = history[history.length - 1]
  const day = (date: string) => formatMonthDay(parseISO(date), locale)
  return (
    <figure
      role="img"
      aria-label={t.chartLabel(
        { kcal: roundKcal(first.kcal), day: day(first.date) },
        { kcal: roundKcal(last.kcal), day: day(last.date) },
        formulaKcal !== undefined ? roundKcal(formulaKcal) : null,
      )}
      className="mt-4 select-none"
    >
      <div className="relative h-28 px-1 py-4">
        <div className="relative h-full">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
          >
            <polygon
              points={[...upper, ...lower].join(' ')}
              className="fill-primary/12"
            />
            {formulaKcal !== undefined ? (
              <line
                x1="0"
                x2="100"
                y1={y(formulaKcal)}
                y2={y(formulaKcal)}
                className="stroke-muted-foreground/70"
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <polyline
              points={history.map((p, i) => `${x(i)},${y(p.kcal)}`).join(' ')}
              fill="none"
              className="stroke-primary"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {history.map((point, index) => (
            <span
              key={point.date}
              aria-hidden="true"
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary',
                index === history.length - 1 ? 'size-2.5' : 'size-1.5',
              )}
              style={{ left: `${x(index)}%`, top: `${y(point.kcal)}%` }}
            />
          ))}
          {/* Labels sit on the side away from the formula line, so they never cross it. */}
          <span
            aria-hidden="true"
            className={cn(
              'absolute pl-1 type-caption whitespace-nowrap text-muted-foreground tabular-nums',
              formulaKcal !== undefined && first.kcal < formulaKcal
                ? 'translate-y-1/2'
                : '-translate-y-[150%]',
            )}
            style={{ left: '0%', top: `${y(first.kcal)}%` }}
          >
            {roundKcal(first.kcal)}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'absolute -translate-x-full pr-1 type-caption font-medium whitespace-nowrap text-primary tabular-nums',
              formulaKcal !== undefined && last.kcal < formulaKcal
                ? 'translate-y-1/2'
                : '-translate-y-[150%]',
            )}
            style={{ left: '100%', top: `${y(last.kcal)}%` }}
          >
            {roundKcal(last.kcal)}
          </span>
          {formulaKcal !== undefined ? (
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-0 type-caption whitespace-nowrap text-muted-foreground tabular-nums',
                first.kcal < formulaKcal
                  ? '-translate-y-[125%]'
                  : 'translate-y-1/4',
              )}
              style={{ top: `${y(formulaKcal)}%` }}
            >
              {t.formula(roundKcal(formulaKcal))}
            </span>
          ) : null}
        </div>
      </div>
      <div
        aria-hidden="true"
        className="relative mx-1 h-4 type-caption whitespace-nowrap text-muted-foreground"
      >
        {history.map((point, index) => (
          <span
            key={point.date}
            className={cn(
              'absolute top-0',
              index === 0
                ? ''
                : index === history.length - 1
                  ? '-translate-x-full'
                  : '-translate-x-1/2',
            )}
            style={{ left: `${x(index)}%` }}
          >
            {day(point.date)}
          </span>
        ))}
      </div>
      <figcaption className="mt-1 type-caption text-muted-foreground">
        {t.chartCaption}
      </figcaption>
    </figure>
  )
}
