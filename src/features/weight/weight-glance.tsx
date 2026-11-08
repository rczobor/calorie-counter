import { Link } from '@tanstack/react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@/features/households/convex-hooks'
import { RecordWeightDialog } from './record-weight-dialog'
import { datedLabel, formatKg } from './weight-format'

/**
 * One quiet line under Today's calorie summary: the viewed day's weight, or a
 * Record action while that day has none.
 * The label opens the weight page, which shows the same person: the person
 * selection is shared.
 */
export function WeightGlance({
  personId,
  personName,
  date,
  today,
}: {
  personId: Id<'people'>
  personName: string
  date: string
  today: string
}) {
  const [recording, setRecording] = useState(false)
  const day = useQuery(api.weight.listRange, {
    personId,
    startDate: date,
    endDate: date,
  })
  const entry = day?.[0]
  const canRecord = day !== undefined && !entry

  return (
    <div className="flex min-h-12 items-center gap-3 border-b border-border/60">
      <Link
        to="/weight"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-sm hover:text-primary"
      >
        <span className="font-medium">Weight</span>{' '}
        {day === undefined ? (
          <Skeleton className="h-4 w-28" />
        ) : entry ? (
          <span className="ml-auto font-medium tabular-nums">
            {formatKg(entry.weightKg)}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              kg
            </span>
          </span>
        ) : (
          // Like the calorie card, this means the day in the page title. An
          // earlier day's weight here would read as this day's.
          <span className="ml-auto min-w-0 truncate text-muted-foreground">
            Not recorded
          </span>
        )}
        {canRecord ? null : (
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
        )}
      </Link>
      {canRecord ? (
        <Button
          variant="ghost"
          className="-mr-3 h-11 px-3"
          aria-label={`Record ${personName}’s weight for ${datedLabel(date, today)}`}
          onClick={() => setRecording(true)}
        >
          <Plus />
          Record
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
