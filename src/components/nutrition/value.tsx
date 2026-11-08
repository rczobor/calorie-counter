import { ArrowDownRight, ArrowUpRight, Check } from 'lucide-react'
import type { ReactNode } from 'react'

import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './value.messages'

// The figure and unit steps: a list row, the sheet's food list, a food under
// an opened meal (one step below its meal row), a stat or total, a batch's
// summary figures, and a page's lead figure (the latest weight).
const SIZES = {
  row: ['text-base', 'type-footnote'],
  nested: ['type-callout', 'type-footnote'],
  child: ['type-subhead', 'type-footnote'],
  headline: ['type-headline', 'type-footnote'],
  stat: ['type-title', 'type-subhead'],
  display: ['type-display', 'type-title'],
} as const

/**
 * A figure as the app shows it everywhere: a semibold tabular number, then
 * a smaller muted unit ("kcal", "g", "kcal/100 g"). It never wraps, so a
 * value column stays one line.
 */
export function Value({
  value,
  unit = 'kcal',
  size = 'row',
  className,
}: {
  value: ReactNode
  unit?: ReactNode
  size?: keyof typeof SIZES
  className?: string
}) {
  const [figure, unitSize] = SIZES[size]
  return (
    <span
      className={cn(
        figure,
        'font-semibold whitespace-nowrap tabular-nums',
        className,
      )}
    >
      {value}
      {unit ? (
        <>
          {' '}
          <span className={cn(unitSize, 'font-normal text-muted-foreground')}>
            {unit}
          </span>
        </>
      ) : null}
    </span>
  )
}

/**
 * A balance against a goal, as Today's badge says it: the state colour, an
 * arrow and a sign on overage, the figure semibold and "kcal left / over"
 * one step smaller. At the goal it says so with a check. The figure and
 * icon follow the surrounding text size.
 */
export function Balance({
  remaining,
  className,
}: {
  /** Goal minus logged: negative is over. */
  remaining: number
  className?: string
}) {
  const t = useMessages(messages)
  const figure = Math.round(Math.abs(remaining))
  const over = remaining < 0 && figure > 0
  const Icon = over ? ArrowUpRight : figure === 0 ? Check : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold whitespace-nowrap tabular-nums',
        over ? 'text-kcal-over' : 'text-kcal-left',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-[1.0625em] shrink-0" />
      {figure === 0 ? (
        t.goalReached
      ) : (
        <>
          {over ? '+' : ''}
          {figure}{' '}
          {/* Inter's narrow space at this size runs "kcal left" together. */}
          <span className="ml-0.5 type-footnote font-medium tracking-normal [word-spacing:0.1em]">
            {over ? t.kcalOver : t.kcalLeft}
          </span>
        </>
      )}
    </span>
  )
}
