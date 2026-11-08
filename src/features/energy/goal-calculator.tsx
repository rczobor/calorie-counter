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
  energyPlanIssue,
  formulaMaintenance,
  goalForPlan,
  roundKcal,
  weeksToTarget,
  type ActivityLevel,
  type EnergyPlanIssue,
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
import { formatAmount } from '@/i18n/format'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import {
  calculatorReason,
  closeness,
  currentGoalLine,
  formatKgPerWeek,
  isSuggestedPace,
  listWords,
  roughDate,
  signedKcal,
  signedKg,
} from './energy-format'
import { messages } from './goal-calculator.messages'

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
  const t = useMessages(messages)
  const locale = useLocale()
  const [sex, setSex] = useState<EnergySex | null>(profile?.sex ?? null)
  const [birthYear, setBirthYear] = useState(
    profile ? String(profile.birthYear) : '',
  )
  const [height, setHeight] = useState(profile ? String(profile.heightCm) : '')
  const [weight, setWeight] = useState(
    latestWeight ? formatKg(latestWeight.kg, locale) : '',
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
      ? formatKg(plan.targetWeightKg, locale)
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
        ? t.birthYearError(MIN_BIRTH_YEAR, thisYear)
        : null,
    height:
      height.trim() &&
      (heightCm === null ||
        heightCm < MIN_HEIGHT_CM ||
        heightCm > MAX_HEIGHT_CM)
        ? t.heightError(MIN_HEIGHT_CM, MAX_HEIGHT_CM)
        : null,
    weight:
      weight.trim() &&
      (weightKg === null ||
        weightKg < MIN_WEIGHT_KG ||
        weightKg > MAX_WEIGHT_KG)
        ? t.weightError(MIN_WEIGHT_KG, MAX_WEIGHT_KG)
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
  const targetError = target.trim() && targetKg === null ? t.targetError : null
  const issue =
    energyProfile && goalPlan && body
      ? energyPlanIssue({
          profile: energyProfile,
          plan: goalPlan,
          date: today,
          weightKg: body.weightKg,
        })
      : null
  const problem = targetError ?? (issue ? describeIssue(issue, locale) : null)
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
    !sex && t.missingWords.sex,
    year === null && t.missingWords.birthYear,
    heightCm === null && t.missingWords.height,
    weightKg === null && t.missingWords.weight,
    !activity && t.missingWords.activity,
    !direction && t.missingWords.goal,
  ].filter((item) => typeof item === 'string')

  function chooseDirection(next: Direction) {
    setDirection(next)
    // A new direction starts at its saved pace, or the suggested one.
    if (next === 'maintain' || next === direction) return
    setPace(
      plan && plan.direction === next
        ? plan.percentPerWeek
        : DEFAULT_PACE[next],
    )
  }

  async function use() {
    if (!result || !energyProfile || !goalPlan) return
    setPending(true)
    try {
      await onUse({
        goalKcal: result.goalKcal,
        reason: calculatorReason(goalPlan, locale),
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
    formatKg(weightKg, locale) === formatKg(latestWeight.kg, locale)
      ? latestWeight.date === today
        ? t.todaysWeighIn
        : t.weighInOn(datedLabel(latestWeight.date, today, locale))
      : t.notSaved

  const id = useId()
  const pacesFor =
    direction === 'lose' || direction === 'gain' ? direction : null
  const savedPace =
    plan && plan.direction === direction && plan.direction !== 'maintain'
      ? plan.percentPerWeek
      : undefined
  const projection =
    weeks !== null && !problem && targetKg !== null
      ? t.projection(
          formatAmount(targetKg, locale),
          roughDate(addDays(parseISO(today), Math.round(weeks * 7)), locale),
          Math.round(weeks),
        )
      : null

  return (
    <EditorDialog
      title={t.title}
      description={t.description(name)}
      pending={pending}
      onClose={onClose}
    >
      <div className="space-y-6 pt-1 pb-6">
        <section aria-labelledby={`${id}-about`}>
          <GroupHeading id={`${id}-about`}>{t.about(name)}</GroupHeading>
          <p className="px-4 pb-3 type-footnote text-muted-foreground">
            {t.adultsOnly}
          </p>
          <div className="space-y-4">
            <Choices
              legend={t.sex}
              value={sex}
              onChange={setSex}
              options={[
                { value: 'female', label: t.female },
                { value: 'male', label: t.male },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={t.birthYear}
                htmlFor={`${id}-born`}
                hint={<FieldError>{errors.birthYear}</FieldError>}
              >
                <Input
                  id={`${id}-born`}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t.birthYearPlaceholder}
                  className="tabular-nums"
                  value={birthYear}
                  onChange={(event) => setBirthYear(event.target.value)}
                  aria-invalid={errors.birthYear ? true : undefined}
                />
              </Field>
              <Field
                label={t.height}
                htmlFor={`${id}-height`}
                hint={<FieldError>{errors.height}</FieldError>}
              >
                <UnitInput
                  id={`${id}-height`}
                  unit="cm"
                  // Text, not number: phones in comma locales type "170,5".
                  type="text"
                  autoComplete="off"
                  placeholder={t.heightPlaceholder}
                  value={height}
                  onChange={(event) => setHeight(event.target.value)}
                  aria-invalid={errors.height ? true : undefined}
                />
              </Field>
            </div>
            <Field
              label={t.weight}
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
                placeholder={t.weightPlaceholder}
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                aria-invalid={errors.weight ? true : undefined}
              />
            </Field>
          </div>
          {minor ? (
            <Notice>
              {t.minor(
                (text) => (
                  <b className="font-semibold">{text}</b>
                ),
                name,
              )}
            </Notice>
          ) : null}
        </section>

        <section aria-labelledby={`${id}-activity`}>
          <GroupHeading id={`${id}-activity`} aside={t.toMaintain}>
            {t.typicalDay}
          </GroupHeading>
          <RecordList label={t.typicalDay} empty={null}>
            {ACTIVITY_LEVELS.map((level) => {
              const estimate = maintenanceAt(level)
              return (
                <RecordRow
                  key={level}
                  title={t.activity[level].title}
                  detail={t.activity[level].description}
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
            {t.lowerActivity}
          </p>
        </section>

        <section aria-labelledby={`${id}-goal`} className="space-y-4">
          <GroupHeading id={`${id}-goal`} className="pb-0">
            {t.goal}
          </GroupHeading>
          <Choices
            legend={t.goal}
            legendHidden
            value={direction}
            onChange={chooseDirection}
            options={[
              { value: 'lose', label: t.lose, disabled: underweight },
              { value: 'maintain', label: t.maintain },
              { value: 'gain', label: t.gain },
            ]}
          />
          {underweight ? (
            <p className="px-4 type-footnote text-muted-foreground">
              {t.noLossBelowBmi(formatAmount(MIN_HEALTHY_BMI, locale))}
            </p>
          ) : null}
          {pacesFor ? (
            <>
              <div>
                <GroupHeading aside={t.dailyGoal}>{t.pace}</GroupHeading>
                <RecordList label={t.pace} empty={null}>
                  {PACES[pacesFor].map((value) => {
                    const paceNames: Record<number, string> = t.paces[pacesFor]
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
                        ? t.yourPlan
                        : savedPace === undefined &&
                            isSuggestedPace(pacesFor, value)
                          ? t.suggested
                          : null
                    const percent = formatAmount(value, locale)
                    return (
                      <RecordRow
                        key={value}
                        title={
                          <>
                            {paceNames[value]}
                            {badge ? (
                              <span className="ml-2 rounded-full border px-1.5 py-px align-middle type-caption font-medium text-muted-foreground">
                                {badge}
                              </span>
                            ) : null}
                          </>
                        }
                        detail={
                          kg !== null
                            ? t.paceDetail(
                                percent,
                                signedKg(
                                  pacesFor === 'lose' ? -kg : kg,
                                  locale,
                                ),
                              )
                            : t.pacePercent(percent)
                        }
                        value={goal ? goal.goalKcal : '—'}
                        unit={
                          goal ? (goal.heldAtMinimum ? t.minimum : 'kcal') : ''
                        }
                        selected={pace === value}
                        onOpen={() => setPace(value)}
                      />
                    )
                  })}
                </RecordList>
                {formula ? (
                  <p className="px-4 pt-1.5 type-footnote text-muted-foreground">
                    {t.fromMaintenance(roundKcal(formula.kcal))}
                  </p>
                ) : null}
              </div>
              <Field
                label={t.target}
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
                  placeholder={t.optional}
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
            locale={locale}
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
              {t.kcalADay}
            </span>
          </p>
          {/* Two lines at most, so the footer keeps its height. */}
          <p className="type-footnote text-pretty text-muted-foreground">
            {minor
              ? t.noSuggestionForMinors
              : !result || !goalPlan
                ? missing.length > 2
                  ? t.addMore(missing[0], missing[1], missing.length - 2)
                  : missing.length
                    ? t.add(listWords(missing, locale))
                    : t.checkDetails
                : currentGoalKcal
                  ? currentGoalLine(currentGoalKcal, result.goalKcal, locale)
                  : goalPlan.direction === 'maintain'
                    ? t.keepsWeight
                    : t.perWeek(
                        goalPlan.direction,
                        formatKgPerWeek(result.kgPerWeek, locale),
                      )}
          </p>
        </div>
        <Button
          size="lg"
          disabled={!result || pending}
          onClick={() => void use()}
        >
          {t.useGoal}
        </Button>
      </SheetFooter>
    </EditorDialog>
  )
}

/** The server's plan check, worded in the person's language. */
function describeIssue(issue: EnergyPlanIssue, locale: Locale) {
  const t = messages[locale].problems
  switch (issue.kind) {
    case 'birthYear':
      return t.birthYear(MIN_BIRTH_YEAR, issue.latestYear)
    case 'height':
      return t.height(MIN_HEIGHT_CM, MAX_HEIGHT_CM)
    case 'adultsOnly':
      return t.adults
    case 'pace':
      return t.pace
    case 'lowBmi':
      return t.noLoss(formatAmount(MIN_HEALTHY_BMI, locale))
    case 'targetInvalid':
      return t.targetInvalid
    case 'targetBelowHealthy':
      return t.belowHealthy(formatKg(issue.minimumKg, locale))
    case 'targetNotBelow':
      return t.notBelow
    case 'targetNotAbove':
      return t.notAbove
  }
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
  locale,
}: {
  formula: { kcal: number; uncertaintyKcal: number }
  result: ReturnType<typeof goalForPlan>
  plan: GoalPlan
  sex: EnergySex
  personName: string
  locale: Locale
}) {
  const t = messages[locale]
  return (
    <section aria-labelledby="goal-breakdown">
      <GroupHeading aside={t.kcalADay}>
        <span id="goal-breakdown">{t.howItAddsUp}</span>
      </GroupHeading>
      <dl className="inset-group inset-rows type-subhead tabular-nums">
        <div className="flex justify-between gap-3 px-4 py-3">
          <dt className="text-muted-foreground">
            {t.maintenance(closeness(formula.uncertaintyKcal, locale))}
            <span className="block type-footnote">
              {t.likely(
                roundKcal(formula.kcal - formula.uncertaintyKcal),
                roundKcal(formula.kcal + formula.uncertaintyKcal),
              )}
            </span>
          </dt>
          <dd>≈ {roundKcal(formula.kcal)}</dd>
        </div>
        {plan.direction === 'maintain' ? null : (
          <div className="flex justify-between gap-3 px-4 py-3">
            <dt className="text-muted-foreground">
              {t.forChange(signedKg(result.kgPerWeek, locale))}
            </dt>
            <dd>{signedKcal(result.adjustmentKcal)}</dd>
          </div>
        )}
        {/* The sum, not a second hero: the footer carries the goal. */}
        <div className="flex justify-between gap-3 px-4 py-3 font-medium">
          <dt>{t.dailyGoal}</dt>
          <dd>{result.goalKcal}</dd>
        </div>
      </dl>
      {result.heldAtMinimum ? (
        <Notice>{t.heldAtMinimum(MIN_GOAL_KCAL[sex])}</Notice>
      ) : null}
      <p className="flex gap-2 px-4 pt-2 type-footnote text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>{t.startingEstimate(personName)}</span>
      </p>
    </section>
  )
}
