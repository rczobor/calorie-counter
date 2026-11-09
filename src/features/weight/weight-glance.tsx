import { Link } from '@tanstack/react-router'
import { ChevronRight, Lock, Plus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Value } from '@/components/nutrition/value'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@/features/households/convex-hooks'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { RecordWeightDialog } from './record-weight-dialog'
import { datedLabel, formatKg } from './weight-format'
import { messages } from './weight-glance.messages'

/**
 * One quiet cell under Today's calorie summary: the viewed day's weight, or a
 * Record action while that day has none.
 * The label opens the weight page, which shows the same person: the person
 * selection is shared.
 */
export function WeightGlance({
  personId,
  personName,
  date,
  today,
  isPrivate = false,
}: {
  personId: Id<'people'>
  personName: string
  date: string
  today: string
  /** Another member's person: their weight is theirs alone. */
  isPrivate?: boolean
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const [recording, setRecording] = useState(false)
  const day = useQuery(
    api.weight.listRange,
    isPrivate ? 'skip' : { personId, startDate: date, endDate: date },
  )
  // A static cell: nothing to open or record.
  if (isPrivate)
    return (
      <div className="flex min-h-12 items-center gap-3 inset-group py-2.5 pr-3.5 pl-4 text-base text-foreground">
        <span className="flex-1">{t.weight}</span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          {t.privateTo(personName)}
          <Lock aria-hidden="true" className="size-4 shrink-0" />
        </span>
      </div>
    )
  const entry = day?.[0]
  const canRecord = day !== undefined && !entry

  return (
    <div className="flex items-center inset-group">
      <Link
        to="/weight"
        className={cn(LIST_ROW_CLASS, 'min-w-0 flex-1', canRecord && 'pr-3')}
      >
        <span className="flex-1">{t.weight}</span>
        {day === undefined ? (
          <Skeleton className="h-4 w-20" />
        ) : entry ? (
          <Value value={formatKg(entry.weightKg, locale)} unit="kg" />
        ) : (
          // Like the calorie card, this means the day in the page title. An
          // earlier day's weight here would read as this day's.
          <span className="min-w-0 truncate text-muted-foreground">
            {t.notRecorded}
          </span>
        )}
        {canRecord ? null : (
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        )}
      </Link>
      {/* A row that holds a button has no chevron: the label opens the page
          and the button is the only other target. */}
      {canRecord ? (
        <Button
          variant="outline"
          size="sm"
          className="mr-3.5"
          aria-label={t.recordLabel(
            personName,
            datedLabel(date, today, locale),
          )}
          onClick={() => setRecording(true)}
        >
          <Plus />
          {t.record}
        </Button>
      ) : null}
      {recording ? (
        <RecordWeightDialog
          personId={personId}
          personName={personName}
          today={today}
          request={{ kind: 'new', date }}
          onClose={() => setRecording(false)}
        />
      ) : null}
    </div>
  )
}
