import { addDays, parseISO } from 'date-fns'
import { Info } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import {
  ACTIVITY_LEVELS,
  DEFAULT_PACE,
  MAX_HEIGHT_CM,
  MIN_ADULT_AGE,
  MIN_BIRTH_YEAR,
  MIN_GOAL_KCAL,
  MIN_HEALTHY_BMI,
  MIN_HEIGHT_CM,
  PACES,
  ageInYearOf,
  bmi,
  energyPlanProblem,
  formulaMaintenance,
  goalForPlan,
  roundKcal,
  weeksToTarget,
  type ActivityLevel,
  type EnergyProfile,
  type EnergySex,
  type GoalPlan,
} from '../../../convex/lib/energy'
import { Field, UnitInput } from '@/components/list/field'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { SheetFooter } from '@/components/list/sheet-footer'
import { EditorDialog } from '@/components/page/editor-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SEGMENT_CLASS,
  SEGMENT_LIST_CLASS,
  SegmentedTrack,
} from '@/components/ui/segmented'
import {
  datedLabel,
  formatKg,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  parseWeightInput as parseDecimal,
} from '@/features/weight/weight-format'
import { cn } from '@/lib/utils'
import {
  ACTIVITY_COPY,
  calculatorReason,
  closeness,
  currentGoalLine,
  formatKgPerWeek,
  isSuggestedPace,
  listWords,
  PACE_NAMES,
  roughDate,
  signedKcal,
  signedKg,
} from './energy-format'

export type CalculatorChoice = {
  goalKcal: number
  reason: string
  energyProfile: EnergyProfile
  goalPlan: GoalPlan
}

type Direction = GoalPlan['direction']

/**
 * Suggests a daily goal from a few facts about a person and the weight change
 * they want. The formula is a starting point; the Weight page's check-in
 * replaces it with the person's own numbers once they have logged for a while.
 * Nothing is saved here: `onUse` gets the goal, profile and plan.
 */
export function GoalCalculator({
  personName,
  profile,
  plan,
  latestWeight,
  currentGoalKcal,
  today,
  onUse,
  onClose,
}: {
  personName: string
  profile?: EnergyProfile
  plan?: GoalPlan
  latestWeight: { kg: number; date: string } | null
  currentGoalKcal?: number
  today: string
  onUse: (choice: CalculatorChoice) => void | Promise<void>
  onClose: () => void
}) {
  const [sex, setSex] = useState<EnergySex | null>(profile?.sex ?? null)
  const [birthYear, setBirthYear] = useState(
    profile ? String(profile.birthYear) : '',
  )
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : '')
  const [weight, setWeight] = useState(
    latestWeight ? formatKg(latestWeight.kg) : '',
  )
  const [activity, setActivity] = useState<ActivityLevel | null>(
    profile?.activity ?? null,
  )
  const [direction, setDirection] = useState<Direction | null>(
    plan?.direction ?? null,
  )
  const [pace, setPace] = useState<number>(
    plan && plan.direction !== 'maintain'
      ? plan.percentPerWeek
      : DEFAULT_PACE.lose,
  )
  const [target, setTarget] = useState(
    plan && plan.direction !== 'maintain' && plan.targetWeightKg !== undefined
      ? formatKg(plan.targetWeightKg)
      : '',
  )
  const [pending, setPending] = useState(false)

  // A person being created may not have a name yet.
  const name = personName.trim()
  const thisYear = Number(today.slice(0, 4))
  const year = /^\d{4}$/.test(birthYear.trim()) ? Number(birthYear) : null
  const heightCm = parseDecimal(height)
  const weightKg = parseDecimal(weight)
  const errors = {
    birthYear:
      birthYear.trim() &&
      (year === null || year < MIN_BIRTH_YEAR || year > thisYear)
        ? `Enter a year between ${MIN_BIRTH_YEAR} and ${thisYear}.`
        : null,
    height:
      height.trim() &&
      (heightCm === null ||
        heightCm < MIN_HEIGHT_CM ||
        heightCm > MAX_HEIGHT_CM)
        ? `Enter a height between ${MIN_HEIGHT_CM} and ${MAX_HEIGHT_CM} cm.`
        : null,
    weight:
      weight.trim() &&
      (weightKg === null ||
        weightKg < MIN_WEIGHT_KG ||
        weightKg > MAX_WEIGHT_KG)
        ? `Enter a weight between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`
        : null,
  }
  const body =
    sex &&
    year !== null &&
    heightCm !== null &&
    weightKg !== null &&
    !errors.birthYear &&
    !errors.height &&
    !errors.weight
      ? { sex, birthYear: year, heightCm, weightKg }
      : null
  const minor =
    year !== null &&
    !errors.birthYear &&
    ageInYearOf(year, today) < MIN_ADULT_AGE
  const underweight =
    body !== null && bmi(body.weightKg, body.heightCm) < MIN_HEALTHY_BMI
  const maintenanceAt = (level: ActivityLevel) =>
    body
      ? formulaMaintenance({ ...body, activity: level }, body.weightKg, today)
      : null

  const targetKg = target.trim() ? parseDecimal(target) : null
  const goalPlan: GoalPlan | null =
    direction === null
      ? null
      : direction === 'maintain'
        ? { direction }
        : {
            direction,
            percentPerWeek: pace,
            ...(targetKg !== null ? { targetWeightKg: targetKg } : {}),
          }
  const energyProfile: EnergyProfile | null =
    body && activity
      ? {
          sex: body.sex,
          birthYear: body.birthYear,
          heightCm: body.heightCm,
          activity,
        }
      : null
  const targetError =
    target.trim() && targetKg === null
      ? 'Enter a target weight in kilograms, like 75.'
      : null
  const problem =
    targetError ??
    (energyProfile && goalPlan && body
      ? energyPlanProblem({
          profile: energyProfile,
          plan: goalPlan,
          date: today,
          weightKg: body.weightKg,
        })
      : null)
  const formula =
    energyProfile && body
      ? formulaMaintenance(energyProfile, body.weightKg, today)
      : null
  const result =
    formula && goalPlan && body && !problem && !minor
      ? goalForPlan({
          maintenanceKcal: formula.kcal,
          weightKg: body.weightKg,
          sex: body.sex,
          plan: goalPlan,
        })
      : null
  const weeks = goalPlan && body ? weeksToTarget(goalPlan, body.weightKg) : null
  const missing = [
    !sex && 'sex',
    year === null && 'year of birth',
    heightCm === null && 'height',
    weightKg === null && 'weight',
    !activity && 'activity',
    !direction && 'a goal',
  ].filter((item) => typeof item === 'string')

  function chooseDirection(next: Direction) {
    setDirection(next)
    if (
      next !== 'maintain' &&
      !(PACES[next] as readonly number[]).includes(pace)
    )
      setPace(DEFAULT_PACE[next])
  }

  async function use() {
    if (!result || !energyProfile || !goalPlan) return
    setPending(true)
    try {
      await onUse({
        goalKcal: result.goalKcal,
        reason: calculatorReason(goalPlan),
        energyProfile,
        goalPlan,
      })
    } finally {
      setPending(false)
    }
  }

  const weightHelp =
    latestWeight &&
    weightKg !== null &&
    formatKg(weightKg) === formatKg(latestWeight.kg)
      ? latestWeight.date === today
        ? 'From today’s weigh-in.'
        : `From the weigh-in on ${datedLabel(latestWeight.date, today)}.`
      : 'Used for this estimate only, not saved as a weigh-in.'

  const id = useId()
  const pacesFor =
    direction === 'lose' || direction === 'gain' ? direction : null
  const savedPace =
    plan && plan.direction === direction && plan.direction !== 'maintain'
      ? plan.percentPerWeek
      : undefined
  const projection =
    weeks !== null && !problem
      ? `Reach ${targetKg} kg around ${roughDate(addDays(parseISO(today), Math.round(weeks * 7)))}, in about ${Math.round(weeks)} weeks`
      : null

  return (
    <EditorDialog
      title="Find a daily goal"
      description={`A suggested daily goal for ${name || 'a new person'}. Nothing changes until you use it.`}
      pending={pending}
      onClose={onClose}
    >
      <div className="space-y-6 pt-1 pb-6">
        <section aria-labelledby={`${id}-about`}>
          <GroupHeading id={`${id}-about`}>
            {name ? `About ${name}` : 'About this person'}
          </GroupHeading>
          <p className="px-4 pb-3 type-footnote text-muted-foreground">
            For adults who aren’t pregnant or breastfeeding.
          </p>
          <div className="space-y-4">
            <Choices
              legend="Sex for the formula"
              value={sex}
              onChange={setSex}
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Year of birth"
                htmlFor={`${id}-born`}
                hint={<FieldError>{errors.birthYear}</FieldError>}
              >
                <Input
                  id={`${id}-born`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="e.g. 1990"
                  className="tabular-nums"
                  value={birthYear}
                  onChange={(event) => setBirthYear(event.target.value)}
                  aria-invalid={errors.birthYear ? true : undefined}
                />
              </Field>
              <Field
                label="Height"
                htmlFor={`${id}-height`}
                hint={<FieldError>{errors.height}</FieldError>}
              >
                <UnitInput
                  id={`${id}-height`}
                  unit="cm"
                  // Text, not number: phones in comma locales type "170,5".
                  type="text"
                  autoComplete="off"
                  placeholder="e.g. 170"
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  aria-invalid={errors.height ? true : undefined}
                />
              </Field>
            </div>
            <Field
              label="Weight"
              htmlFor={`${id}-weight`}
              hint={
                errors.weight ? (
                  <FieldError>{errors.weight}</FieldError>
                ) : (
                  weightHelp
                )
              }
            >
              <UnitInput
                id={`${id}-weight`}
                unit="kg"
                type="text"
                autoComplete="off"
                placeholder="e.g. 75"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                aria-invalid={errors.weight ? true : undefined}
              />
            </Field>
          </div>
          {minor ? (
            <Notice>
              <b className="font-semibold">This is for adults.</b> Teens need
              extra energy to grow, so adult formulas don’t fit. A doctor or
              dietitian can suggest {name ? `${name}’s goal` : 'a goal'}; you
              can still enter it by hand.
            </Notice>
          ) : null}
        </section>

        <section aria-labelledby={`${id}-activity`}>
          <GroupHeading id={`${id}-activity`} aside="To maintain">
            On a typical day
          </GroupHeading>
          <RecordList label="On a typical day" empty={null}>
            {ACTIVITY_LEVELS.map((level) => {
              const estimate = maintenanceAt(level)
              return (
                <RecordRow
                  key={level}
                  title={ACTIVITY_COPY[level].title}
                  detail={ACTIVITY_COPY[level].description}
                  // The column holds its place while details are missing.
                  value={estimate ? roundKcal(estimate.kcal) : '—'}
                  unit={estimate ? 'kcal' : ''}
                  selected={activity === level}
                  onOpen={() => setActivity(level)}
                />
              )
            })}
          </RecordList>
          <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
            Unsure? Pick the lower one. Most people overestimate, and check-ins
            correct it.
          </p>
        </section>

        <section aria-labelledby={`${id}-goal`} className="space-y-4">
          <GroupHeading id={`${id}-goal`} className="pb-0">
            Goal
          </GroupHeading>
          <Choices
            legend="Goal"
            legendHidden
            value={direction}
            onChange={chooseDirection}
            options={[
              { value: 'lose', label: 'Lose', disabled: underweight },
              { value: 'maintain', label: 'Maintain' },
              { value: 'gain', label: 'Gain' },
            ]}
          />
          {underweight ? (
            <p className="px-4 type-footnote text-muted-foreground">
              Losing weight isn’t offered below a BMI of {MIN_HEALTHY_BMI}.
            </p>
          ) : null}
          {pacesFor ? (
            <>
              <div>
                <GroupHeading aside="Daily goal">Pace</GroupHeading>
                <RecordList label="Pace" empty={null}>
                  {PACES[pacesFor].map((value) => {
                    const goal =
                      formula && body
                        ? goalForPlan({
                            maintenanceKcal: formula.kcal,
                            weightKg: body.weightKg,
                            sex: body.sex,
                            plan: {
                              direction: pacesFor,
                              percentPerWeek: value,
                            },
                          })
                        : null
                    const kg = body ? (body.weightKg * value) / 100 : null
                    const badge =
                      savedPace === value
                        ? 'Your plan'
                        : savedPace === undefined &&
                            isSuggestedPace(pacesFor, value)
                          ? 'Suggested'
                          : null
                    return (
                      <RecordRow
                        key={value}
                        title={
                          <>
                            {PACE_NAMES[pacesFor][value]}
                            {badge ? (
                              <span className="ml-2 rounded-full border px-1.5 py-px align-middle type-caption font-medium text-muted-foreground">
                                {badge}
                              </span>
                            ) : null}
                          </>
                        }
                        detail={
                          kg !== null
                            ? `${value}% · ${signedKg(pacesFor === 'lose' ? -kg : kg)} a week`
                            : `${value}% a week`
                        }
                        value={goal ? goal.goalKcal : '—'}
                        unit={
                          goal ? (goal.heldAtMinimum ? 'minimum' : 'kcal') : ''
                        }
                        selected={pace === value}
                        onOpen={() => setPace(value)}
                      />
                    )
                  })}
                </RecordList>
                {formula ? (
                  <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
                    From ≈ {roundKcal(formula.kcal)} kcal a day maintenance.
                  </p>
                ) : null}
              </div>
              <Field
                label="Target weight (optional)"
                htmlFor={`${id}-target`}
                hint={
                  target.trim() && problem ? (
                    <FieldError>{problem}</FieldError>
                  ) : (
                    projection
                  )
                }
              >
                <UnitInput
                  id={`${id}-target`}
                  unit="kg"
                  type="text"
                  autoComplete="off"
                  placeholder="Optional"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  aria-invalid={target.trim() && problem ? true : undefined}
                />
              </Field>
            </>
          ) : null}
          {problem && !target.trim() ? (
            <p className="px-4 type-footnote text-destructive">{problem}</p>
          ) : null}
        </section>

        {result && formula && goalPlan && body ? (
          <Breakdown
            formula={formula}
            result={result}
            plan={goalPlan}
            sex={body.sex}
            personName={name}
          />
        ) : null}
      </div>
      <SheetFooter>
        <div className="mr-auto min-w-0 flex-1" role="status">
          <p className="type-title tabular-nums">
            {result ? (
              <span className="font-semibold">{result.goalKcal}</span>
            ) : (
              <span className="text-muted-foreground">–</span>
            )}{' '}
            <span className="type-subhead font-normal text-muted-foreground">
              kcal a day
            </span>
          </p>
          {/* Two lines at most, so the footer keeps its height. */}
          <p className="type-footnote text-pretty text-muted-foreground">
            {minor
              ? 'No suggestion under 18'
              : !result || !goalPlan
                ? missing.length > 2
                  ? `Add ${missing.slice(0, 2).join(', ')} and ${missing.length - 2} more`
                  : missing.length
                    ? `Add ${listWords(missing)}`
                    : 'Check the details above'
                : currentGoalKcal
                  ? currentGoalLine(currentGoalKcal, result.goalKcal)
                  : goalPlan.direction === 'maintain'
                    ? 'Keeps weight steady'
                    : `${goalPlan.direction === 'lose' ? 'Loses' : 'Gains'} ${formatKgPerWeek(result.kgPerWeek)} kg a week`}
          </p>
        </div>
        <Button
          size="lg"
          disabled={!result || pending}
          onClick={() => void use()}
        >
          Use goal
        </Button>
      </SheetFooter>
    </EditorDialog>
  )
}

/** The heading above a grouped list, with the column's meaning on the right. */
function GroupHeading({
  id,
  aside,
  className,
  children,
}: {
  id?: string
  aside?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'group-label flex items-baseline justify-between gap-3',
        className,
      )}
    >
      <h3 id={id}>{children}</h3>
      {aside ? <span className="font-normal">{aside}</span> : null}
    </div>
  )
}

function FieldError({ children }: { children: ReactNode }) {
  return children ? <span className="text-destructive">{children}</span> : null
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 flex gap-2 rounded-xl border border-caution/30 bg-caution/10 px-4 py-3 type-subhead text-caution">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** One choice of a few, as the app's segmented control (a toggle group). */
function Choices<T extends string>({
  legend,
  legendHidden = false,
  value,
  onChange,
  options,
}: {
  legend: string
  legendHidden?: boolean
  value: T | null
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; disabled?: boolean }>
}) {
  return (
    <div>
      {legendHidden ? null : (
        <p className="px-4 pb-1.5 type-subhead font-medium text-foreground">
          {legend}
        </p>
      )}
      <SegmentedTrack className="sm:w-full">
        <div role="group" aria-label={legend} className={SEGMENT_LIST_CLASS}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={value === option.value}
              disabled={option.disabled}
              className={cn(SEGMENT_CLASS, 'sm:flex-1')}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SegmentedTrack>
    </div>
  )
}

function Breakdown({
  formula,
  result,
  plan,
  sex,
  personName,
}: {
  formula: { kcal: number; uncertaintyKcal: number }
  result: ReturnType<typeof goalForPlan>
  plan: GoalPlan
  sex: EnergySex
  personName: string
}) {
  return (
    <section aria-labelledby="goal-breakdown">
      <GroupHeading aside="kcal a day">
        <span id="goal-breakdown">How it adds up</span>
      </GroupHeading>
      <dl className="inset-group inset-rows type-subhead tabular-nums">
        <div className="flex justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">
            Maintenance, {closeness(formula.uncertaintyKcal)}
            <span className="block type-footnote">
              likely {roundKcal(formula.kcal - formula.uncertaintyKcal)}–
              {roundKcal(formula.kcal + formula.uncertaintyKcal)}
            </span>
          </dt>
          <dd>≈ {roundKcal(formula.kcal)}</dd>
        </div>
        {plan.direction === 'maintain' ? null : (
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">
              For {signedKg(result.kgPerWeek)} a week
            </dt>
            <dd>{signedKcal(result.adjustmentKcal)}</dd>
          </div>
        )}
        {/* The sum, not a second hero: the footer carries the goal. */}
        <div className="flex justify-between gap-3 px-4 py-3 font-medium">
          <dt>Daily goal</dt>
          <dd>{result.goalKcal}</dd>
        </div>
      </dl>
      {result.heldAtMinimum ? (
        <Notice>
          Held at the {MIN_GOAL_KCAL[sex]} kcal minimum, so the pace will be
          slower.
        </Notice>
      ) : null}
      <p className="flex gap-2 px-4 pt-2 type-footnote text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          A starting estimate. After two weeks of logs and weigh-ins, the Weight
          page checks it against {personName ? `${personName}’s` : 'the'} real
          trend.
        </span>
      </p>
    </section>
  )
}
