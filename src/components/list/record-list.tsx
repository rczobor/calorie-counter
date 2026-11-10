import { Check, ChevronRight } from 'lucide-react'
import { Children, type MouseEvent, type ReactNode, type Ref } from 'react'

import { LoadingRows } from '@/components/page/loading-content'
import { StatusBadge } from '@/components/page/status-badge'
import { Value } from '@/components/nutrition/value'
import { Button } from '@/components/ui/button'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './record-list.messages'

/**
 * One list that works at every width: rows instead of table columns, so phones
 * never scroll sideways. It is the inset grouped list Today and Settings use
 * (cells on the grouped background, hairlines from the content inset), and it
 * renders the loading rows or the empty message itself.
 */
export function RecordList({
  label,
  loading = false,
  empty,
  children,
  className,
}: {
  /** Names the list, and its loading state ("Loading ingredients"). */
  label: string
  loading?: boolean
  empty: ReactNode
  children?: ReactNode
  className?: string
}) {
  const t = useMessages(messages)
  if (loading)
    return (
      <LoadingRows
        label={t.loading(label)}
        className={cn('inset-group px-4', className)}
      />
    )
  const rows = Children.toArray(children)
  if (!rows.length)
    return (
      <div
        className={cn(
          'inset-group px-4 py-3.5 type-subhead text-muted-foreground',
          className,
        )}
      >
        {empty}
      </div>
    )
  return (
    <ul aria-label={label} className={cn('inset-group inset-rows', className)}>
      {rows}
    </ul>
  )
}

/** State shows only when informative: archived rows, never "Active". */
export function ArchivedBadge() {
  return <StatusBadge status="Archived" className="shrink-0" />
}

type RecordRowProps = {
  title: ReactNode
  /** A compact meta line under the title. Show only informative values. */
  detail?: ReactNode
  /** A number that leads the row in a right column; its unit follows, smaller and muted. */
  value?: ReactNode
  unit?: string
  archived?: boolean
  /** A status badge after the title, such as the signed-in member's "You". */
  badge?: ReactNode
  /**
   * Makes the row its own tap target, with a trailing chevron (a check
   * instead for picker rows). Without it the row is static content, for
   * example a member with only an actions menu.
   */
  onOpen?: (event: MouseEvent<HTMLButtonElement>) => void
  /** A screen-reader verb before the title, such as "Edit". */
  verb?: string
  /** Picker rows: the row is a toggle that shows a check when selected. */
  selected?: boolean
  expanded?: boolean
  disabled?: boolean
  /** Trailing controls outside the tap target. Keep them quiet. */
  actions?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

export function RecordRow({
  title,
  detail,
  value,
  unit,
  archived = false,
  badge,
  onOpen,
  verb,
  selected,
  expanded,
  disabled,
  actions,
  ref,
}: RecordRowProps) {
  const chevron = onOpen !== undefined && selected === undefined
  // The `{' '}` text nodes keep words apart in the button's accessible name.
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 text-base break-words text-foreground">
            {verb ? (
              <>
                <span className="sr-only">{verb}</span>{' '}
              </>
            ) : null}
            {/* Its own element, so the visible title is findable by its text alone. */}
            <span>{title}</span>
          </span>{' '}
          {badge}
          {badge ? ' ' : null}
          {archived ? <ArchivedBadge /> : null}
        </span>{' '}
        {detail ? (
          <span className="mt-0.5 block type-footnote break-words text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>{' '}
      {value !== undefined || selected !== undefined || chevron ? (
        // Values, the check and the chevron share one trailing column, so
        // the title takes every free pixel before it wraps.
        <span className="flex shrink-0 items-center gap-1.5">
          {value !== undefined ? (
            <Value value={value} unit={unit} className="text-right" />
          ) : null}
          {selected !== undefined ? (
            // Every picker row keeps the check's slot, so values stay in one
            // column whichever row is chosen.
            <Check
              aria-hidden="true"
              className={cn('size-5 text-foreground', !selected && 'invisible')}
              strokeWidth={2.5}
            />
          ) : null}
          {chevron ? (
            <ChevronRight
              aria-hidden="true"
              className="size-4 text-muted-foreground"
            />
          ) : null}
        </span>
      ) : null}
    </>
  )
  // Trailing actions sit inside the cell, so the row gives them its padding.
  const rowClass = cn(
    'flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4',
    actions ? 'pr-2' : chevron ? 'pr-3.5' : 'pr-4',
  )
  return (
    <li className="flex items-center">
      {onOpen ? (
        <button
          ref={ref}
          type="button"
          aria-pressed={selected}
          aria-expanded={expanded}
          disabled={disabled}
          className={cn(
            rowClass,
            'text-left outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60',
          )}
          onClick={onOpen}
        >
          {content}
        </button>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
      {actions ? (
        <div className="flex shrink-0 items-center gap-1 pr-2">{actions}</div>
      ) : null}
    </li>
  )
}

/**
 * A row's removal action (a food in a meal, a recipe line): a small muted
 * glyph on a 44px target, set apart from the row's values so it never
 * competes with the kcal column. Tapping the row itself edits it.
 */
export function RowRemoveButton({
  label,
  onClick,
  children,
  className,
}: {
  /** The accessible name, such as "Remove Butter". */
  label: string
  onClick: () => void
  /** The glyph, such as `<Trash2 />`. */
  children: ReactNode
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "text-muted-foreground hover:text-destructive [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
    >
      {children}
    </Button>
  )
}
