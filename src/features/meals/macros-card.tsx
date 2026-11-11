import { Drawer } from '@base-ui/react/drawer'
import { Link } from '@tanstack/react-router'
import { ChevronRight, X } from 'lucide-react'
import type { Infer } from 'convex/values'
import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'
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

const grams = (value: number) => Math.round(value).toString()

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
  const locale = useLocale()
  const { macros, macroTargets: targets } = day
  if (!targets) return null
  const decimal = oneDecimal(locale)
  const columns = [
    {
      key: 'protein',
      label: t.protein,
      eaten: macros?.proteinG ?? 0,
      goal: targets.proteinG,
    },
    {
      key: 'carbs',
      label: t.carbs,
      eaten: macros?.carbsG ?? 0,
      goal: targets.carbsG,
    },
    { key: 'fat', label: t.fat, eaten: macros?.fatG ?? 0, goal: targets.fatG },
  ]
  const perKg =
    day.proteinPerKg === undefined
      ? undefined
      : targets.proteinGPerKg === undefined
        ? t.proteinPerKg(decimal.format(day.proteinPerKg))
        : t.proteinPerKgOfGoal(
            decimal.format(day.proteinPerKg),
            decimal.format(targets.proteinGPerKg),
          )
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={onOpen}
      className="mt-3 flex w-full items-center gap-2 inset-group py-3 pr-3 pl-4 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <span className="sr-only">{t.showByMeal}</span>
      <span className="min-w-0 flex-1">
        <span className="grid grid-cols-3 gap-3">
          {columns.map((column) => (
            <span key={column.key} className="min-w-0">
              <span className="block type-footnote text-muted-foreground">
                {column.label}
              </span>
              <span className="block type-subhead font-semibold whitespace-nowrap text-foreground tabular-nums">
                {column.goal === undefined
                  ? t.grams(grams(column.eaten))
                  : column.eaten < column.goal - 0.5
                    ? t.toGo(grams(column.goal - column.eaten))
                    : t.goalMet}
              </span>
              {column.goal === undefined ? null : (
                <>
                  <MacroBar eaten={column.eaten} goal={column.goal} />
                  <span className="mt-1 block type-footnote whitespace-nowrap text-muted-foreground tabular-nums">
                    {t.ofGoal(grams(column.eaten), grams(column.goal))}
                  </span>
                </>
              )}
            </span>
          ))}
        </span>
        {perKg ? (
          <span className="mt-2 block type-footnote text-muted-foreground tabular-nums">
            {perKg}
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
 * The day's macros meal by meal, so a low figure can be traced to the meals
 * that have no macros. Another member's goals are theirs to change, so the
 * goals link shows only for people the viewer may edit.
 */
export function MacrosByMealSheet({
  meals,
  personId,
  canEditGoals,
  onClose,
}: {
  meals: Array<Pick<Doc<'meals'>, '_id' | 'name' | 'totalCalories' | 'macros'>>
  personId: Id<'people'>
  canEditGoals: boolean
  onClose: () => void
}) {
  const t = useMessages(messages)
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {meals.length === 0 ? (
          <p className="py-4 type-subhead text-muted-foreground">{t.noMeals}</p>
        ) : (
          <ul className="inset-group inset-rows">
            {meals.map((meal) => (
              <li
                key={meal._id}
                className="flex items-center gap-3 py-2.5 pr-4 pl-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base text-foreground">
                    {meal.name}
                  </span>
                  <span className="block type-footnote text-muted-foreground tabular-nums">
                    {meal.macros
                      ? t.mealMacros(
                          grams(meal.macros.proteinG),
                          grams(meal.macros.carbsG),
                          grams(meal.macros.fatG),
                        )
                      : t.noMacros}
                  </span>
                </span>
                <span className="shrink-0 type-subhead text-muted-foreground tabular-nums">
                  {formatKcal(meal.totalCalories)} kcal
                </span>
              </li>
            ))}
          </ul>
        )}
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
