import type { Infer } from 'convex/values'
import { Value } from '@/components/nutrition/value'
import { formatAmount } from '@/i18n/format'
import { useLocale } from '@/i18n/locale'
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
  const rows = [
    {
      key: 'protein',
      label: t.protein,
      grams: macros?.proteinG ?? 0,
      goal: targets?.proteinG,
      note:
        day.proteinPerKg === undefined
          ? undefined
          : t.perKg(
              formatAmount(Math.round(day.proteinPerKg * 10) / 10, locale),
            ),
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
          className={index ? 'ml-4 border-t py-2.5 pr-4' : 'px-4 py-2.5'}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base text-foreground">
              {row.label}
              {row.note ? (
                <span className="ml-2 type-footnote text-muted-foreground tabular-nums">
                  {row.note}
                </span>
              ) : null}
            </span>
            {row.goal === undefined ? (
              <Value value={Math.round(row.grams)} unit="g" />
            ) : (
              <span className="type-subhead whitespace-nowrap text-muted-foreground tabular-nums">
                {t.ofGoal(figure(row.grams), figure(row.goal))}
              </span>
            )}
          </div>
          {row.goal === undefined ? null : (
            <div
              aria-hidden="true"
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-track"
            >
              <div
                className="h-full rounded-full bg-muted-foreground"
                style={{
                  width: `${Math.min(100, (row.grams / row.goal) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </section>
  )
}
