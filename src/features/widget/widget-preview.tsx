import { cn } from '@/lib/utils'
import type { WidgetScriptText } from './scriptable-script'

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
  remaining,
  goal,
  text,
  label,
  placeholder,
  compact = false,
}: {
  person: string
  /** Undefined while loading. */
  remaining?: number
  goal?: number
  text: WidgetScriptText
  /** Names the tile for assistive technology ("Widget preview"). */
  label: string
  placeholder?: string
  /** A smaller tile without the goal line, for showing two side by side. */
  compact?: boolean
}) {
  const over = remaining !== undefined && remaining < 0
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
          <span className="truncate type-footnote font-semibold text-muted-foreground">
            {person}
          </span>
          <span className="flex-1" />
          <span
            className={cn(
              'leading-none font-bold tracking-tight tabular-nums',
              compact ? 'text-[2rem]' : 'text-[2.5rem]',
              over ? 'text-kcal-over' : 'text-kcal-left',
            )}
          >
            {remaining === undefined ? '–' : Math.abs(Math.round(remaining))}
          </span>
          <span
            className={cn(
              'mt-0.5 font-medium',
              compact ? 'text-xs' : 'text-sm',
              over ? 'text-kcal-over' : 'text-muted-foreground',
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
