import { Drawer } from '@base-ui/react/drawer'
import { X } from 'lucide-react'
import { Fragment, useState } from 'react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { LoadMoreButton } from '@/components/list/list-toolbar'
import { RecordList, RecordRow } from '@/components/list/record-list'
import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'
import { usePaginatedQuery } from '@/features/households/convex-hooks'
import { intlLocale, useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatDate } from '@/lib/dates'
import { formatKcal } from '@/lib/nutrition'
import { messages } from './goal-history-sheet.messages'

const PAGE_SIZE = 20

/**
 * Groups goals by the date they take effect. Expects the server's order:
 * newest date first, and newest first within a date, so each group leads with
 * the goal that applied. A date split across pages joins up once the next page
 * loads, and its leading goal is already right.
 */
export function foldSameDayGoals<T extends { effectiveDate: string }>(
  entries: readonly T[],
) {
  const groups: { entry: T; replaced: T[] }[] = []
  for (const entry of entries) {
    const last = groups.at(-1)
    if (last?.entry.effectiveDate === entry.effectiveDate)
      last.replaced.push(entry)
    else groups.push({ entry, replaced: [] })
  }
  return groups
}

/** A person's calorie goals over time, read-only, opened from their editor. */
export function GoalHistorySheet({
  personId,
  onClose,
}: {
  personId: Id<'people'>
  onClose: () => void
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const history = usePaginatedQuery(
    api.people.listGoalHistory,
    { personId },
    { initialNumItems: PAGE_SIZE },
  )
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const time = new Intl.DateTimeFormat(intlLocale(locale), {
    timeStyle: 'short',
  })
  function toggle(id: string) {
    setExpanded((open) => {
      const next = new Set(open)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }
  return (
    <Sheet onClose={onClose} className="max-h-[80dvh] md:max-w-lg">
      <div className="flex shrink-0 items-center justify-between gap-2 pt-1 pr-2 pb-2 pl-4 md:pt-3">
        <Drawer.Title className="min-w-0 truncate type-title">
          {t.title}
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <RecordList
          label={t.title}
          loading={history.status === 'LoadingFirstPage'}
          empty={t.empty}
        >
          {foldSameDayGoals(history.results).map(({ entry, replaced }) => {
            const open = expanded.has(entry._id)
            return (
              <Fragment key={entry._id}>
                <RecordRow
                  title={formatDate(entry.effectiveDate, locale)}
                  detail={
                    entry.reason || replaced.length ? (
                      <>
                        {entry.reason ? (
                          <span className="block">{entry.reason}</span>
                        ) : null}
                        {replaced.length ? (
                          <span className="block">
                            {t.replacedCount(replaced.length)}
                          </span>
                        ) : null}
                      </>
                    ) : undefined
                  }
                  value={formatKcal(entry.goalKcal)}
                  unit={t.kcalPerDay}
                  onOpen={replaced.length ? () => toggle(entry._id) : undefined}
                  expanded={replaced.length ? open : undefined}
                />
                {open
                  ? replaced.map((goal) => (
                      <RecordRow
                        key={goal._id}
                        title={t.replacedAt(time.format(goal.createdAt))}
                        detail={goal.reason}
                        value={formatKcal(goal.goalKcal)}
                        unit={t.kcalPerDay}
                      />
                    ))
                  : null}
              </Fragment>
            )
          })}
        </RecordList>
        {history.status === 'CanLoadMore' ||
        history.status === 'LoadingMore' ? (
          <LoadMoreButton
            loading={history.status === 'LoadingMore'}
            onClick={() => history.loadMore(PAGE_SIZE)}
          >
            {t.loadMore}
          </LoadMoreButton>
        ) : null}
      </div>
    </Sheet>
  )
}
