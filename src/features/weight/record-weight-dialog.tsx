import { Drawer } from '@base-ui/react/drawer'
import type { FunctionReturnType } from 'convex/server'
import { Trash2, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { toErrorMessage } from '@/lib/nutrition'
import {
  datedLabel,
  formatKg,
  MAX_WEIGHT_KG,
  MIN_WEIGHT_KG,
  parseWeightInput,
} from './weight-format'

export type WeightEntry = FunctionReturnType<
  typeof api.weight.listRange
>[number]

export type WeightDialogRequest =
  { kind: 'new'; date: string } | { kind: 'edit'; entry: WeightEntry }

function weightError(text: string) {
  const weight = parseWeightInput(text)
  if (weight === null) return 'Enter a weight in kilograms, like 82.4.'
  if (weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG)
    return `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`
  return null
}

/**
 * Records or corrects one day's weight. A compact bottom sheet on phones and a
 * small centred dialog from `md` up.
 */
export function RecordWeightDialog({
  personId,
  personName,
  today,
  request,
  onClose,
}: {
  personId: Id<'people'>
  personName: string
  today: string
  request: WeightDialogRequest
  onClose: () => void
}) {
  const editing = request.kind === 'edit' ? request.entry : null
  const [date, setDate] = useState(
    request.kind === 'edit' ? request.entry.measuredOn : request.date,
  )
  // The stored value, not the rounded display, so saving unchanged keeps it.
  const [text, setText] = useState(editing ? String(editing.weightKg) : '')
  const [showError, setShowError] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  // A new weight on a day that already has one replaces it, so say so.
  const sameDay = useQuery(
    api.weight.listRange,
    editing ? 'skip' : { personId, startDate: date, endDate: date },
  )
  const existing = editing ?? sameDay?.[0]
  const record = useMutation(api.weight.record)
  const remove = useMutation(api.weight.remove)
  const error = weightError(text)

  async function run(success: string, action: () => Promise<unknown>) {
    setPending(true)
    try {
      await action()
      toast.success(success)
      onClose()
    } catch (failure) {
      toast.error(toErrorMessage(failure))
      setPending(false)
    }
  }

  return (
    <Sheet
      onClose={onClose}
      pending={pending}
      initialFocus={inputRef}
      className="max-h-[92dvh] pb-[max(1rem,env(safe-area-inset-bottom))] md:max-w-md md:pb-5"
    >
      {/* The popup's overshoot fill would add scroll height, so scroll here. */}
      <div className="min-h-0 overflow-y-auto">
        <div className="flex items-start justify-between gap-4 px-5 pt-2 md:pt-5">
          <div>
            <Drawer.Title className="text-lg font-semibold">
              {editing ? 'Edit weight' : 'Record weight'}
            </Drawer.Title>
            <Drawer.Description className="text-sm text-muted-foreground">
              {editing
                ? `${personName} · ${datedLabel(editing.measuredOn, today)}`
                : personName}
            </Drawer.Description>
          </div>
          <Drawer.Close
            disabled={pending}
            render={
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 size-10"
                aria-label="Close"
              />
            }
          >
            <X />
          </Drawer.Close>
        </div>
        <form
          className="mt-4 space-y-4 px-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (error) {
              setShowError(true)
              inputRef.current?.focus()
              return
            }
            const weightKg = parseWeightInput(text)
            if (weightKg === null) return
            void run(editing ? 'Weight updated.' : 'Weight saved.', () =>
              record({
                personId,
                measuredOn: date,
                weightKg,
                expectedEditRevision: existing?.editRevision,
              }),
            )
          }}
        >
          <fieldset disabled={pending} className="min-w-0 space-y-4">
            {editing ? null : (
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={date}
                  onChange={setDate}
                  ariaLabel="Weight date"
                  label={datedLabel(date, today)}
                  className="h-10 rounded-full"
                />
              </div>
            )}
            {!editing && existing ? (
              // Said before the field, so nobody replaces a weight unawares.
              <p className="text-sm" role="status">
                This day already has {formatKg(existing.weightKg)} kg. Saving
                replaces it.
              </p>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="weight-kg">Weight</Label>
              <div className="relative">
                <Input
                  id="weight-kg"
                  ref={inputRef}
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="done"
                  className="h-12 pr-12 text-2xl font-semibold tabular-nums md:text-2xl"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  aria-invalid={showError && error ? true : undefined}
                  aria-describedby={showError && error ? errorId : undefined}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground"
                >
                  kg
                </span>
              </div>
              {showError && error ? (
                <p id={errorId} className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              {editing ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="-ml-2.5 text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                size="lg"
                className="h-11"
                disabled={!text.trim()}
              >
                Save weight
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
      {editing ? (
        <ConfirmDestructiveDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          disabled={pending}
          title="Delete this weight?"
          description={`${formatKg(editing.weightKg)} kg on ${datedLabel(editing.measuredOn, today)} will be removed.`}
          onConfirm={() => {
            setConfirmDelete(false)
            void run('Weight deleted.', () =>
              remove({
                entryId: editing._id,
                expectedEditRevision: editing.editRevision,
              }),
            )
          }}
        />
      ) : null}
    </Sheet>
  )
}
