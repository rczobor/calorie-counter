import { addDays, parseISO } from 'date-fns'
import { Info } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

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
      ? formatAmount(plan.targetWeightKg, locale)
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
  // Only a lose or gain plan uses the target; a stale one never blocks Maintain.
  const targetError =
    (direction === 'lose' || direction === 'gain') &&
    target.trim() &&
    targetKg === null
      ? t.targetError
      : null
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

  async function applyGoal() {
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
  /** When a valid target would be reached at a pace ("mid-March 2027"). */
  const arrivalAt = (percentPerWeek: number) => {
    if (!pacesFor || !body || targetKg === null || problem) return null
    const weeks = weeksToTarget(
      { direction: pacesFor, percentPerWeek, targetWeightKg: targetKg },
      body.weightKg,
    )
    return weeks === null
      ? null
      : roughDate(addDays(parseISO(today), Math.round(weeks * 7)), locale)
  }
  const targetLabel = targetKg !== null ? formatAmount(targetKg, locale) : ''
  // A goal held at the minimum loses more slowly than its pace, so it gets
  // no date it can't keep.
  const arrivalDate =
    goalPlan && goalPlan.direction !== 'maintain' && !result?.heldAtMinimum
      ? arrivalAt(goalPlan.percentPerWeek)
      : null
  const arrival = arrivalDate ? t.reachBy(targetLabel, arrivalDate) : null

  // Each step asks one thing; Next waits until it is answered. A saved plan
  // opens on its result, whose working leads back to the steps, or on the
  // first step that needs attention (a target already reached, say).
  const complete: Record<Step, boolean> = {
    about: body !== null && !minor,
    activity: activity !== null,
    goal: result !== null,
    result: result !== null,
  }
  const [step, setStep] = useState<Step>(() =>
    plan ? (STEPS.find((each) => !complete[each]) ?? 'result') : 'about',
  )
  const stepIndex = STEPS.indexOf(step)
  const topRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  useEffect(() => {
    // After Back or Next, start the new step at its top and move focus to its
    // heading, as a new page would. Opening the sheet keeps the sheet's focus.
    if (!moved.current) return
    topRef.current?.scrollIntoView({ block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [step])
  function goTo(next: Step) {
    moved.current = true
    // The chosen pace's goal grows into the result's number, and shrinks back.
    const morph =
      (next === 'result' || step === 'result') &&
      typeof document.startViewTransition === 'function' &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    if (morph)
      document.startViewTransition(() => flushSync(() => setStep(next)))
    else setStep(next)
  }

  // A step opened from the result's working goes straight back to it once
  // the plan is whole again, instead of through the later steps.
  const [fromResult, setFromResult] = useState(false)
  const backToResult = fromResult && step !== 'result' && result !== null
  function change(next: Step) {
    setFromResult(true)
    goTo(next)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!complete[step]) return
    if (step === 'result') void applyGoal()
    else if (backToResult) {
      setFromResult(false)
      goTo('result')
    } else goTo(STEPS[stepIndex + 1])
  }

  const heading = (title: ReactNode, note?: string) => (
    <div className="pb-4">
      <h3 ref={headingRef} tabIndex={-1} className="type-headline outline-none">
        {title}
      </h3>
      {note ? (
        <p className="pt-0.5 type-footnote text-pretty text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  )

  const missing = [
    year === null && t.missingWords.birthYear,
    heightCm === null && t.missingWords.height,
    weightKg === null && t.missingWords.weight,
  ].filter((item) => typeof item === 'string')
  // Why Next waits. A goal that breaks a guardrail says so in the step.
  const waiting = complete[step]
    ? null
    : step === 'about'
      ? minor
        ? t.noSuggestionForMinors
        : !sex || missing.length
          ? t.missingDetails(!sex, listWords(missing, locale))
          : null
      : step === 'activity'
        ? t.chooseActivity
        : step === 'goal' && !direction
          ? t.chooseGoal
          : null

  return (
    <EditorDialog
      title={t.title}
      description={t.description(name)}
      pending={pending}
      onClose={onClose}
    >
      <form className="flex flex-1 flex-col" noValidate onSubmit={submit}>
        <div ref={topRef} className="scroll-mt-4 pt-1 pb-6">
          <Progress
            step={stepIndex + 1}
            total={STEPS.length}
            label={t.stepOf(stepIndex + 1, STEPS.length)}
          />
          {step === 'about' ? (
            <section>
              {heading(t.about(name), t.adultsOnly)}
              <div className="space-y-4">
                {/* Radio rows, like every other choice in the flow, so an
                    unanswered one reads as waiting, not disabled. */}
                <div>
                  <p className="px-4 pb-1.5 type-subhead font-medium">
                    {t.sex}
                  </p>
                  {/* Two short options share one row, as two tiles on the
                      same columns as the fields below. */}
                  <ul
                    aria-label={t.sex}
                    className="grid grid-cols-2 gap-3 *:inset-group"
                  >
                    {(['female', 'male'] as const).map((option) => (
                      <RecordRow
                        key={option}
                        title={t[option]}
                        selected={sex === option}
                        onOpen={() => setSex(option)}
                      />
                    ))}
                  </ul>
                </div>
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
                      // Sized like the number fields beside it.
                      className="tabular-nums md:max-w-60"
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
          ) : null}

          {step === 'activity' ? (
            <section>
              {heading(t.typicalDay, t.lowerActivity)}
              {/* The column's meaning, ending over the figures, spaced as
                  the Pace header is. */}
              <p className="px-4 pb-1.5 text-right type-footnote text-muted-foreground">
                {t.toMaintain}
              </p>
              <RecordList
                label={t.typicalDay}
                empty={null}
                className="[--row-inset:3rem]"
              >
                {ACTIVITY_LEVELS.map((level) => {
                  const estimate = maintenanceAt(level)
                  return (
                    <RecordRow
                      key={level}
                      title={t.activity[level].title}
                      detail={t.activity[level].description}
                      value={estimate ? roundKcal(estimate.kcal) : undefined}
                      unit="kcal"
                      selected={activity === level}
                      onOpen={() => setActivity(level)}
                    />
                  )
                })}
              </RecordList>
            </section>
          ) : null}

          {step === 'goal' ? (
            <section className="space-y-4">
              <div>
                {heading(t.goal)}
                <Choices
                  legend={t.goal}
                  value={direction}
                  onChange={chooseDirection}
                  options={[
                    { value: 'lose', label: t.lose, disabled: underweight },
                    { value: 'maintain', label: t.maintain },
                    { value: 'gain', label: t.gain },
                  ]}
                />
              </div>
              {underweight ? (
                <p className="px-4 type-footnote text-muted-foreground">
                  {t.noLossBelowBmi(formatAmount(MIN_HEALTHY_BMI, locale))}
                </p>
              ) : null}
              {pacesFor ? (
                <>
                  <Field
                    label={t.target}
                    htmlFor={`${id}-target`}
                    // Each pace below says when the target would be reached.
                    hint={
                      target.trim() && problem ? (
                        <FieldError>{problem}</FieldError>
                      ) : null
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
                  <div>
                    <GroupHeading aside={t.dailyGoal}>{t.pace}</GroupHeading>
                    <RecordList
                      label={t.pace}
                      empty={null}
                      className="[--row-inset:3rem]"
                    >
                      {PACES[pacesFor].map((value) => {
                        const paceNames: Record<number, string> =
                          t.paces[pacesFor]
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
                        const arrives = goal?.heldAtMinimum
                          ? null
                          : arrivalAt(value)
                        return (
                          <RecordRow
                            key={value}
                            title={
                              <>
                                {paceNames[value]}
                                {badge ? ' ' : null}
                                {badge ? (
                                  <span className="ml-1 rounded-full border px-1.5 py-px align-middle type-caption font-medium text-muted-foreground">
                                    {badge}
                                  </span>
                                ) : null}
                              </>
                            }
                            detail={
                              <>
                                {kg !== null
                                  ? t.paceDetail(
                                      percent,
                                      signedKg(
                                        pacesFor === 'lose' ? -kg : kg,
                                        locale,
                                      ),
                                    )
                                  : t.pacePercent(percent)}
                                {arrives ? (
                                  <>
                                    {' '}
                                    <span className="block">
                                      {t.arrives(arrives)}
                                    </span>
                                  </>
                                ) : null}
                              </>
                            }
                            value={
                              goal ? (
                                <span
                                  style={
                                    pace === value
                                      ? { viewTransitionName: GOAL_MORPH }
                                      : undefined
                                  }
                                >
                                  {goal.goalKcal}
                                </span>
                              ) : undefined
                            }
                            unit={goal?.heldAtMinimum ? t.minimum : 'kcal'}
                            selected={pace === value}
                            onOpen={() => setPace(value)}
                          />
                        )
                      })}
                    </RecordList>
                  </div>
                </>
              ) : null}
              {problem && !target.trim() ? (
                <p className="px-4 type-footnote text-destructive">{problem}</p>
              ) : null}
            </section>
          ) : null}

          {step === 'result' &&
          result &&
          formula &&
          goalPlan &&
          body &&
          energyProfile ? (
            <section>
              {heading(t.suggestedGoal, t.startingEstimate(name))}
              <p>
                <span
                  className="type-display"
                  style={{ viewTransitionName: GOAL_MORPH }}
                >
                  {result.goalKcal}
                </span>{' '}
                <span className="type-headline font-normal text-muted-foreground">
                  {t.kcalADay}
                </span>
              </p>
              <p className="pt-2 pb-4 type-subhead text-pretty text-muted-foreground">
                {currentGoalKcal
                  ? currentGoalLine(currentGoalKcal, result.goalKcal, locale)
                  : goalPlan.direction === 'maintain'
                    ? t.keepsWeight
                    : t.perWeek(
                        goalPlan.direction,
                        formatKgPerWeek(result.kgPerWeek, locale),
                      )}
                {arrival ? <span className="block">{arrival}</span> : null}
              </p>
              <GoalRange
                goal={result.goalKcal}
                current={currentGoalKcal}
                low={roundKcal(formula.kcal - formula.uncertaintyKcal)}
                high={roundKcal(formula.kcal + formula.uncertaintyKcal)}
                locale={locale}
              />
              <Breakdown
                formula={formula}
                result={result}
                plan={goalPlan}
                activity={energyProfile.activity}
                about={{
                  title: t.about(name),
                  detail: t.bodyDetail(
                    body.sex === 'female' ? t.female : t.male,
                    body.birthYear,
                    formatAmount(body.heightCm, locale),
                    formatKg(body.weightKg, locale),
                  ),
                }}
                sex={body.sex}
                locale={locale}
                onChange={change}
                disabled={pending}
              />
            </section>
          ) : null}
        </div>
        <SheetFooter>
          {stepIndex > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              disabled={pending}
              onClick={() => goTo(STEPS[stepIndex - 1])}
            >
              {t.back}
            </Button>
          ) : null}
          {/* Back keeps the left edge; the reason Next waits sits beside Next. */}
          <p
            role="status"
            className="min-w-0 flex-1 type-footnote text-balance text-muted-foreground"
          >
            {waiting}
          </p>
          <Button
            type="submit"
            size="lg"
            disabled={!complete[step] || pending}
            // "See daily goal" and "Use … kcal" share this slot: the second tap
            // of a double tap must not save a goal the person hasn't seen.
            onClick={(event) => {
              if (step === 'result' && event.detail > 1) event.preventDefault()
            }}
          >
            {/* The save names the figure it saves. */}
            {step === 'result' && result
              ? t.useGoal(result.goalKcal)
              : step === 'goal' || backToResult
                ? t.seeGoal
                : t.next}
          </Button>
        </SheetFooter>
      </form>
    </EditorDialog>
  )
}

const STEPS = ['about', 'activity', 'goal', 'result'] as const
type Step = (typeof STEPS)[number]

/** The view transition name the goal's figure keeps from pace row to result. */
const GOAL_MORPH = 'calculator-goal-kcal'

/** Where the person is in the steps: one bar per step, filled up to this one. */
function Progress({
  step,
  total,
  label,
}: {
  step: number
  total: number
  label: string
}) {
  return (
    <div className="pb-5">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-valuetext={label}
        className="flex gap-1.5"
      >
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              // The input stroke, so the track shows in both themes.
              index < step ? 'bg-primary' : 'bg-input/50',
            )}
          />
        ))}
      </div>
    </div>
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

/**
 * A question's label above a grouped list, in the field-label tier, with the
 * column's meaning on the right, ending over the figures.
 */
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
        'flex items-baseline justify-between gap-3 px-4 pb-1.5',
        className,
      )}
    >
      <h4 id={id} className="type-subhead font-medium">
        {children}
      </h4>
      {aside ? (
        <span className="type-footnote text-muted-foreground">{aside}</span>
      ) : null}
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
  value,
  onChange,
  options,
}: {
  /** The group's accessible name; the step heading shows it. */
  legend: string
  value: T | null
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; disabled?: boolean }>
}) {
  return (
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
  )
}

/**
 * The suggestion against the person's likely maintenance and current goal, on
 * one number line. Only its likely range is read out; the other figures are in
 * the text around it.
 */
function GoalRange({
  goal,
  current,
  low,
  high,
  locale,
}: {
  goal: number
  current?: number
  low: number
  high: number
  locale: Locale
}) {
  const t = messages[locale].range
  const values = [goal, low, high, ...(current ? [current] : [])]
  // Padded, so no mark sits at the end of the track.
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.2, 80)
  const min = Math.min(...values) - pad
  const max = Math.max(...values) + pad
  const at = (kcal: number) => ((kcal - min) / (max - min)) * 100
  // Marks this close share one label, so the labels never overlap (a label
  // near an end grows inward by its full width), and marks closer still draw
  // only the goal's.
  const apart = current === undefined ? 100 : Math.abs(at(goal) - at(current))
  const together = apart < 35
  const oneMark = apart < 4
  // A chart, not a control: one soft track carrying the range and the marks,
  // the range named above it and the marks below, with no accent colour.
  return (
    <div className="pb-6 type-footnote text-muted-foreground tabular-nums">
      <div className="relative h-5">
        <RangeLabel at={(at(low) + at(high)) / 2}>
          {t.maintenance(low, high)}
        </RangeLabel>
      </div>
      {/* A bullet chart: the goal is the bold marker, the current goal a
          thin one, dropped where the two are too close to draw apart. */}
      <div aria-hidden="true" className="relative mt-1.5 h-4">
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-[2px] bg-foreground/10" />
        <span
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-[2px] bg-foreground/30"
          style={{ left: `${at(low)}%`, width: `${at(high) - at(low)}%` }}
        />
        {current !== undefined && !oneMark ? (
          <span
            className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/50"
            style={{ left: `${at(current)}%` }}
          />
        ) : null}
        <span
          className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-background"
          style={{ left: `${at(goal)}%` }}
        />
      </div>
      <div aria-hidden="true" className="relative mt-1.5 h-5">
        <RangeLabel at={at(goal)}>
          <span className="font-semibold text-foreground">{goal}</span>
          {current !== undefined && together
            ? ` · ${t.current(current)}`
            : null}
        </RangeLabel>
        {current !== undefined && !together ? (
          <RangeLabel at={at(current)}>{t.current(current)}</RangeLabel>
        ) : null}
      </div>
    </div>
  )
}

/** A label on the number line; near an edge it grows inward instead. */
function RangeLabel({
  at,
  className,
  children,
}: {
  at: number
  className?: string
  children: ReactNode
}) {
  // Near an end the label starts or ends flush with its mark.
  const shift =
    at < 20 ? '-0.125rem' : at > 80 ? 'calc(-100% + 0.125rem)' : '-50%'
  return (
    <span
      className={cn('absolute top-0 whitespace-nowrap', className)}
      style={{ left: `${at}%`, transform: `translateX(${shift})` }}
    >
      {children}
    </span>
  )
}

/** The working, one row per choice; each row opens the step that set it. */
function Breakdown({
  formula,
  result,
  plan,
  activity,
  about,
  sex,
  locale,
  onChange,
  disabled,
}: {
  formula: { kcal: number; uncertaintyKcal: number }
  result: ReturnType<typeof goalForPlan>
  plan: GoalPlan
  activity: ActivityLevel
  about: { title: string; detail: string }
  sex: EnergySex
  locale: Locale
  onChange: (step: Step) => void
  disabled: boolean
}) {
  const t = messages[locale]
  return (
    <section aria-labelledby="goal-breakdown">
      {/* The column's meaning ends over the figures, left of the chevrons. */}
      <GroupHeading id="goal-breakdown" aside={t.kcalADay} className="pr-9">
        {t.howItAddsUp}
      </GroupHeading>
      <RecordList label={t.howItAddsUp} empty={null}>
        <RecordRow
          title={about.title}
          detail={about.detail}
          verb={t.change}
          disabled={disabled}
          onOpen={() => onChange('about')}
        />
        <RecordRow
          title={t.activity[activity].title}
          detail={t.maintenance(closeness(formula.uncertaintyKcal, locale))}
          value={`≈ ${roundKcal(formula.kcal)}`}
          unit=""
          verb={t.change}
          disabled={disabled}
          onOpen={() => onChange('activity')}
        />
        {plan.direction === 'maintain' ? (
          <RecordRow
            title={t.maintain}
            verb={t.change}
            disabled={disabled}
            onOpen={() => onChange('goal')}
          />
        ) : (
          <RecordRow
            title={
              (t.paces[plan.direction] as Record<number, string>)[
                plan.percentPerWeek
              ]
            }
            detail={t.paceDetail(
              formatAmount(plan.percentPerWeek, locale),
              signedKg(result.kgPerWeek, locale),
            )}
            value={signedKcal(result.adjustmentKcal)}
            unit=""
            verb={t.change}
            disabled={disabled}
            onOpen={() => onChange('goal')}
          />
        )}
      </RecordList>
      {result.heldAtMinimum ? (
        <Notice>{t.heldAtMinimum(MIN_GOAL_KCAL[sex])}</Notice>
      ) : null}
    </section>
  )
}
