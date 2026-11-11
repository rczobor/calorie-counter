import type { FunctionReturnType } from 'convex/server'
import { useMessages } from '@/i18n/messages'
import type { api } from '../../../convex/_generated/api'
import { messages } from './macro-summary.messages'

type MacroTotals = NonNullable<
  FunctionReturnType<typeof api.meals.getDayNutrition>['macros']
>

// Below this share some logged kcal come from foods without macros.
const FULL_COVERAGE = 0.995

/**
 * The day's protein, carbs and fat. When some foods have no macros it says
 * how much of the day the grams account for, so a partial total never reads
 * as the whole day. Days without any macros show nothing.
 */
export function MacroSummary({
  macros,
  consumedCalories,
}: {
  macros: MacroTotals | undefined
  consumedCalories: number
}) {
  const t = useMessages(messages)
  if (!macros) return null
  const coverage =
    consumedCalories > 0 ? macros.coveredCalories / consumedCalories : 1
  const rows = [
    [t.protein, macros.proteinG],
    [t.carbs, macros.carbsG],
    [t.fat, macros.fatG],
  ] as const
  return (
    <section aria-label={t.macros} className="mt-4 border-t pt-3">
      <dl className="grid grid-cols-3 gap-3 tabular-nums">
        {rows.map(([label, grams]) => (
          <div key={label} className="min-w-0">
            <dt className="type-footnote text-muted-foreground">{label}</dt>
            <dd className="type-headline font-semibold">
              {t.grams(Math.round(grams).toString())}
            </dd>
          </div>
        ))}
      </dl>
      {coverage < FULL_COVERAGE ? (
        <p className="mt-2 type-footnote text-muted-foreground tabular-nums">
          {t.coverage(Math.round(coverage * 100).toString())}
        </p>
      ) : null}
    </section>
  )
}
