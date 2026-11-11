import type { Infer } from 'convex/values'
import { Value } from '@/components/nutrition/value'
import { intakeBarGeometry } from '@/features/meals/intake-bar'
import { intlLocale, useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import type { dayNutrition } from '../../../convex/lib/dayNutrition'
import { messages } from './macros-card.messages'

type Day = Pick<
  Infer<typeof dayNutrition>,
  'macros' | 'macroTargets' | 'proteinPerKg'
>

const figure = (grams: number) => (
  <span className="font-semibold text-foreground">{Math.round(grams)}</span>
)

/**
 * The day's protein, carbs and fat, apart from the calorie card. A macro
 * with a goal shows its progress like calories do, in neutral ink: the
 * left / over colours belong to calories. Shows nothing on a day with
 * neither macros nor goals.
 */
export function MacrosCard({ day }: { day: Day }) {
  const t = useMessages(messages)
  const locale = useLocale()
  const { macros, macroTargets: targets } = day
  if (!macros && !targets) return null
  // One decimal always, so 1.0 never reads as a rounded goal.
  const oneDecimal = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const rows = [
    {
      key: 'protein',
      label: t.protein,
      grams: macros?.proteinG ?? 0,
      goal: targets?.proteinG,
      note:
        day.proteinPerKg === undefined
          ? undefined
          : t.perKg(oneDecimal.format(day.proteinPerKg)),
    },
    {
      key: 'carbs',
      label: t.carbs,
      grams: macros?.carbsG ?? 0,
      goal: targets?.carbsG,
    },
    { key: 'fat', label: t.fat, grams: macros?.fatG ?? 0, goal: targets?.fatG },
  ]
  return (
    <section aria-label={t.macros} className="mt-3 inset-group">
      {rows.map((row, index) => (
        <div
          key={row.key}
          className={
            index
              ? 'ml-4 flex min-h-11 flex-col justify-center border-t py-2 pr-4'
              : 'flex min-h-11 flex-col justify-center px-4 py-2'
          }
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base text-foreground">{row.label}</span>
            <span className="flex items-baseline gap-1.5 whitespace-nowrap">
              {/* Beside the intake it measures, so it never reads as the goal. */}
              {row.note ? (
                <span className="type-footnote text-muted-foreground tabular-nums">
                  {row.note} ·
                </span>
              ) : null}
              {row.goal === undefined ? (
                <Value value={Math.round(row.grams)} unit="g" />
              ) : (
                <span className="type-subhead text-muted-foreground tabular-nums">
                  {t.ofGoal(figure(row.grams), figure(row.goal))}
                </span>
              )}
            </span>
          </div>
          {row.goal === undefined ? null : (
            <MacroBar grams={row.grams} goal={row.goal} />
          )}
        </div>
      ))}
    </section>
  )
}

/**
 * A neutral bar: going past a macro goal is no error, so it keeps one ink.
 * Past the goal the bar is the intake and a tick marks the goal, as the
 * calorie bar does, so 71 / 70 and 120 / 70 look different.
 */
function MacroBar({ grams, goal }: { grams: number; goal: number }) {
  const bar = intakeBarGeometry(grams, goal)
  return (
    <div aria-hidden="true" className="relative mt-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full bg-muted-foreground dark:bg-muted-foreground/60"
          style={{ width: `${bar.over ? 100 : bar.fill}%` }}
        />
      </div>
      {bar.over ? (
        <div
          className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-card"
          style={{ left: `${bar.tick}%` }}
        />
      ) : null}
    </div>
  )
}
