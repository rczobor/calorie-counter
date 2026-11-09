import { cn } from '@/lib/utils'
import type { WidgetScriptText } from './scriptable-script'

/**
 * The widget's ring, as the script draws it: teal for what is left, emptying
 * through the day; over the goal, a berry arc on a berry track for how far
 * over, as a share of the goal. Here it uses the app's own tokens, which
 * follow the theme.
 */
function WidgetRing({
  consumed,
  goal,
  size,
}: {
  consumed: number
  goal: number
  size: number
}) {
  const left = goal > 0 ? Math.round(goal - consumed) / goal : -1
  // The script's small ring: a 7pt stroke on 44pt.
  const width = (size * 7) / 44
  const circle = {
    cx: size / 2,
    cy: size / 2,
    r: (size - width) / 2,
    fill: 'none',
    strokeWidth: width,
    pathLength: 100,
  }
  const arc = left >= 0 ? left : Math.min(1, Math.max(0.08, -left))
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      className="shrink-0 -rotate-90"
    >
      <circle
        {...circle}
        className={left >= 0 ? 'stroke-track' : 'stroke-kcal-over-surface'}
      />
      {arc > 0 ? (
        <circle
          {...circle}
          className={left >= 0 ? 'stroke-kcal-left-bar' : 'stroke-kcal-over'}
          strokeLinecap={arc >= 1 ? undefined : 'round'}
          strokeDasharray={`${Math.min(1, arc) * 100} 100`}
        />
      ) : null}
    </svg>
  )
}

/**
 * The small Home Screen widget as the Scriptable script draws it, from the
 * same text and the app's left / over colours, so people see what they get
 * before creating a private key. Keep it in step with `widgetScript`. The
 * popover surface is white in light and the elevated grey in dark, so the tile
 * stands raised on its recessed well in both themes.
 *
 * With `placeholder`, it is a widget that has no script chosen yet: the state
 * the setup steps fix, drawn generically rather than as Scriptable's own.
 */
export function WidgetPreview({
  person,
  consumed,
  remaining,
  goal,
  text,
  label,
  placeholder,
  compact = false,
}: {
  person: string
  /** Undefined while loading. */
  consumed?: number
  remaining?: number
  goal?: number
  text: WidgetScriptText
  /** Names the tile for assistive technology ("Widget preview"). */
  label: string
  placeholder?: string
  /** A smaller tile without the goal line, for showing two side by side. */
  compact?: boolean
}) {
  const over = remaining !== undefined && Math.round(remaining) < 0
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'flex shrink-0 flex-col rounded-[1.375rem] bg-popover shadow-[0_2px_10px_oklch(0_0_0/0.1)]',
        compact ? 'size-32 p-3' : 'size-40 p-3.5',
      )}
    >
      {placeholder ? (
        <span className="m-auto text-center type-footnote text-muted-foreground">
          {placeholder}
        </span>
      ) : (
        <>
          {/* The name and the ring share the top row, as in the script. */}
          <div className="flex items-start gap-1">
            <span className="min-w-0 flex-1 truncate type-footnote font-semibold text-foreground">
              {person}
            </span>
            {consumed !== undefined && goal !== undefined ? (
              <WidgetRing
                consumed={consumed}
                goal={goal}
                size={compact ? 32 : 40}
              />
            ) : null}
          </div>
          <span className="flex-1" />
          <span
            className={cn(
              'leading-none font-bold tracking-tight tabular-nums',
              compact ? 'text-[1.75rem]' : 'text-[2.25rem]',
              over ? 'text-kcal-over' : 'text-kcal-left',
            )}
          >
            {remaining === undefined ? '–' : Math.abs(Math.round(remaining))}
          </span>
          <span
            className={cn(
              'mt-0.5 font-medium text-muted-foreground',
              compact ? 'text-xs' : 'text-sm',
            )}
          >
            {over ? text.over : text.left}
          </span>
          {/* Too narrow for the goal line, the compact tile leaves it out. */}
          {compact ? null : (
            <span className="mt-1.5 truncate text-xs text-muted-foreground">
              {goal === undefined
                ? ' '
                : text.goal.replace('{goal}', String(goal))}
            </span>
          )}
        </>
      )}
    </div>
  )
}
