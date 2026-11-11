import { Drawer } from '@base-ui/react/drawer'
import { Link } from '@tanstack/react-router'
import { Check, ChevronRight, X } from 'lucide-react'
import type { Infer } from 'convex/values'
import { Value } from '@/components/nutrition/value'
import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { intakeBarGeometry } from '@/features/meals/intake-bar'
import { intlLocale, useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatKcal } from '@/lib/nutrition'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { dayNutrition } from '../../../convex/lib/dayNutrition'
import { messages } from './macros-card.messages'

type Day = Pick<
  Infer<typeof dayNutrition>,
  'macros' | 'macroTargets' | 'proteinPerKg'
>

const figure = (value: number | string) => (
  <span className="type-subhead font-semibold text-foreground">{value}</span>
)

function oneDecimal(locale: Locale) {
  // One decimal always, so 1.0 never reads as a rounded goal.
  return new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/**
 * The day's protein, carbs and fat beside each other, for a person who set a
 * macro goal: setting one is how macros are switched on. A macro with a goal
 * says what is still to eat and shows a neutral bar (the left / over colours
 * belong to calories); one without shows its grams. Tapping opens the
 * day's macros by meal.
 */
export function MacrosCard({ day, onOpen }: { day: Day; onOpen: () => void }) {
  const t = useMessages(messages)
  const { macros, macroTargets: targets } = day
  if (!targets) return null
  const macroList = [
    {
      key: 'protein',
      label: t.protein,
      eaten: Math.round(macros?.proteinG ?? 0),
      goal: targets.proteinG,
    },
    {
      key: 'carbs',
      label: t.carbs,
      eaten: Math.round(macros?.carbsG ?? 0),
      goal: targets.carbsG,
    },
    {
      key: 'fat',
      label: t.fat,
      eaten: Math.round(macros?.fatG ?? 0),
      goal: targets.fatG,
    },
  ]
  // The strip is about the goals the person chose; the other macros are
  // one quiet line below them.
  const withGoal = macroList.flatMap(({ goal, ...macro }) =>
    goal === undefined ? [] : [{ ...macro, goal: Math.round(goal) }],
  )
  const others = macroList.filter((macro) => macro.goal === undefined)
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="mt-3 flex w-full items-center gap-2 inset-group py-3 pr-3 pl-4 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="sr-only">{t.showByMeal}</span>
      <span className="min-w-0 flex-1">
        {withGoal.length ? (
          <span
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${withGoal.length}, minmax(0, 1fr))`,
            }}
          >
            {withGoal.map((macro) => (
              <span key={macro.key} className="min-w-0">
                <span className="block type-footnote text-muted-foreground">
                  {macro.label}
                </span>
                {/* What is left comes from the figures shown, so the lines
                    agree. */}
                <span className="flex items-center gap-1 type-footnote whitespace-nowrap text-muted-foreground tabular-nums">
                  {macro.eaten < macro.goal ? (
                    t.left(figure(macro.goal - macro.eaten))
                  ) : (
                    <>
                      <Check aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="font-semibold text-foreground">
                        {t.goalReached}
                      </span>
                    </>
                  )}
                </span>
                <MacroBar eaten={macro.eaten} goal={macro.goal} />
                <span className="mt-1 block type-footnote whitespace-nowrap text-muted-foreground tabular-nums">
                  {t.ofGoal(String(macro.eaten), String(macro.goal))}
                </span>
              </span>
            ))}
          </span>
        ) : null}
        {others.length ? (
          <span
            className={cn(
              'block type-footnote text-muted-foreground tabular-nums',
              withGoal.length && 'mt-1.5',
            )}
          >
            {others
              .map((macro) => t.macroGrams(macro.label, String(macro.eaten)))
              .join(' · ')}
          </span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </button>
  )
}

/**
 * A neutral bar: going past a macro goal is no error, so it keeps one ink.
 * Past the goal the bar is the intake and a tick, taller than the bar like
 * the calorie bar's, marks the goal, so 71 / 70 and 120 / 70 look different.
 */
function MacroBar({ eaten, goal }: { eaten: number; goal: number }) {
  const bar = intakeBarGeometry(eaten, goal)
  return (
    <span aria-hidden="true" className="relative mt-1.5 block">
      <span className="block h-1.5 overflow-hidden rounded-full bg-track">
        <span
          className="block h-full rounded-full bg-muted-foreground/55"
          style={{ width: `${bar.over ? 100 : bar.fill}%` }}
        />
      </span>
      {bar.over ? (
        <span
          className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-muted-foreground"
          // Some overage always shows, however small.
          style={{ left: `min(${bar.tick}%, calc(100% - 4px))` }}
        />
      ) : null}
    </span>
  )
}

/**
 * Splits a rounded total across parts so the rounded parts add up to it
 * (largest remainder), so the meals' grams sum to the day's on screen.
 */
export function apportion(values: number[]) {
  const total = Math.round(values.reduce((sum, value) => sum + value, 0))
  const floors = values.map(Math.floor)
  let left = total - floors.reduce((sum, value) => sum + value, 0)
  const order = values
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest)
  for (const { index } of order) {
    if (left <= 0) break
    floors[index] += 1
    left -= 1
  }
  return { total, parts: floors }
}

type Meal = Pick<Doc<'meals'>, '_id' | 'name' | 'totalCalories' | 'macros'>

/**
 * The day's macros meal by meal, as a small ledger: a column per macro and a
 * total that matches the strip, so a low figure can be traced to the meals
 * that have none. Another member's goals are theirs to change, so the goals
 * link shows only for people the viewer may edit.
 */
export function MacrosByMealSheet({
  day,
  meals,
  loading,
  personId,
  canEditGoals,
  onClose,
}: {
  day: Day
  meals: Meal[]
  loading: boolean
  personId: Id<'people'>
  canEditGoals: boolean
  onClose: () => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const decimal = oneDecimal(locale)
  // Protein per kg of the day's weigh-in, against its goal when there is one.
  const goalPerKg = day.macroTargets?.proteinGPerKg
  const perKg =
    day.proteinPerKg === undefined
      ? undefined
      : goalPerKg === undefined
        ? t.proteinPerKg(decimal.format(day.proteinPerKg))
        : t.proteinPerKgOfGoal(
            decimal.format(day.proteinPerKg),
            decimal.format(goalPerKg),
          )
  const keys = ['proteinG', 'carbsG', 'fatG'] as const
  const columns = keys.map((key) =>
    apportion(meals.map((meal) => meal.macros?.[key] ?? 0)),
  )
  const cell = 'text-right tabular-nums'
  return (
    <Sheet onClose={onClose} className="max-h-[80dvh] md:max-w-lg">
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-2 pb-2 pl-4 md:pt-3">
        <Drawer.Title className="min-w-0 truncate type-title">
          {t.byMeal}
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
        {loading ? null : meals.length === 0 ? (
          <p className="py-4 type-subhead text-muted-foreground">{t.noMeals}</p>
        ) : (
          <table className="w-full inset-group">
            <thead>
              <tr className="type-footnote text-muted-foreground">
                <th scope="col" className="py-2 pl-4 text-left font-normal">
                  <span className="sr-only">{t.meal}</span>
                </th>
                <th scope="col" className={`py-2 font-normal ${cell}`}>
                  {t.protein}
                </th>
                <th scope="col" className={`py-2 pl-2 font-normal ${cell}`}>
                  {t.carbs}
                </th>
                <th
                  scope="col"
                  className={`py-2 pr-4 pl-2 font-normal ${cell}`}
                >
                  {t.fat}
                </th>
              </tr>
              <tr className="border-t">
                <th
                  scope="row"
                  className="py-2 pl-4 text-left text-base font-semibold"
                >
                  {t.total}
                </th>
                {columns.map((column, index) => (
                  <td
                    key={keys[index]}
                    className={`py-2 ${index ? 'pl-2' : ''} ${index === 2 ? 'pr-4' : ''} ${cell}`}
                  >
                    <Value value={column.total} unit="g" size="child" />
                  </td>
                ))}
              </tr>
            </thead>
            {meals.map((meal, row) => (
              <tbody key={meal._id} className="border-t">
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={4}
                    className="px-4 pt-2.5 text-left text-base font-normal text-foreground"
                  >
                    {meal.name?.trim() || t.meal}
                  </th>
                </tr>
                <tr>
                  <td className="pb-2.5 pl-4 type-footnote text-muted-foreground tabular-nums">
                    <Value
                      value={formatKcal(meal.totalCalories)}
                      size="child"
                    />
                  </td>
                  {meal.macros ? (
                    columns.map((column, index) => (
                      <td
                        key={keys[index]}
                        className={`pb-2.5 ${index ? 'pl-2' : ''} ${index === 2 ? 'pr-4' : ''} ${cell}`}
                      >
                        <Value
                          value={column.parts[row]}
                          unit="g"
                          size="child"
                        />
                      </td>
                    ))
                  ) : (
                    // One phrase, not three dashes that read as zero.
                    <td
                      colSpan={3}
                      className="pr-4 pb-2.5 text-right type-footnote text-muted-foreground"
                    >
                      {t.noMacros}
                    </td>
                  )}
                </tr>
              </tbody>
            ))}
          </table>
        )}
        {perKg ? (
          <p className="mt-3 px-4 type-footnote text-muted-foreground tabular-nums">
            {perKg}
          </p>
        ) : null}
        {canEditGoals ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            render={<Link to="/people" search={{ edit: personId }} />}
          >
            {t.editGoals}
          </Button>
        ) : null}
      </div>
    </Sheet>
  )
}
