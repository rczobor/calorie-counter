import { Link } from '@tanstack/react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Value } from '@/components/nutrition/value'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useQuery } from '@/features/households/convex-hooks'
import { cn } from '@/lib/utils'
import { RecordWeightDialog } from './record-weight-dialog'
import { datedLabel, formatKg } from './weight-format'

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
    <div className="flex items-center inset-group">
      <Link
        to="/weight"
        className={cn(LIST_ROW_CLASS, 'min-w-0 flex-1', canRecord && 'pr-3')}
      >
        <span className="flex-1">Weight</span>
        {day === undefined ? (
          <Skeleton className="h-4 w-20" />
        ) : entry ? (
          <Value value={formatKg(entry.weightKg)} unit="kg" />
        ) : (
          // Like the calorie card, this means the day in the page title. An
          // earlier day's weight here would read as this day's.
          <span className="min-w-0 truncate text-muted-foreground">
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
      {/* A row that holds a button has no chevron: the label opens the page
          and the button is the only other target. */}
      {canRecord ? (
        <Button
          variant="outline"
          size="sm"
          className="mr-3.5"
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
