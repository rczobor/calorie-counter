import { Drawer } from '@base-ui/react/drawer'
import type { FunctionReturnType } from 'convex/server'
import { Trash2, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Field, UnitInput } from '@/components/list/field'
import { SheetFooter } from '@/components/list/sheet-footer'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { Sheet } from '@/components/page/sheet'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { useMutation, useQuery } from '@/features/households/convex-hooks'
import { useLocale, type Locale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { toErrorMessage } from '@/lib/nutrition'
import { messages } from './record-weight-dialog.messages'
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

function weightError(text: string, locale: Locale) {
  const t = messages[locale]
  const weight = parseWeightInput(text)
  if (weight === null) return t.invalidWeight
  if (weight < MIN_WEIGHT_KG || weight > MAX_WEIGHT_KG)
    return t.outOfRange(MIN_WEIGHT_KG, MAX_WEIGHT_KG)
  return null
}

/**
 * Records or corrects one day's weight. A compact bottom sheet on phones and a
 * small centred dialog from `md` up, with the footer every editor sheet has.
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
  const t = useMessages(messages)
  const locale = useLocale()
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
  const error = weightError(text, locale)

  async function run(success: string, action: () => Promise<unknown>) {
    setPending(true)
    try {
      await action()
      toast.success(success)
      onClose()
    } catch (failure) {
      toast.error(toErrorMessage(failure, locale))
      setPending(false)
    }
  }

  return (
    <Sheet
      onClose={onClose}
      pending={pending}
      initialFocus={inputRef}
      className="max-h-[92dvh] md:max-w-md"
    >
      {/* The sheet header, as every sheet has it: the title tier on the left,
          what it is about under it, and a quiet close. */}
      <div className="flex shrink-0 items-start justify-between gap-2 pt-1 pr-2 pb-2 pl-4 md:pt-3">
        <div className="min-w-0 pt-2">
          <Drawer.Title className="truncate type-title">
            {editing ? t.editTitle : t.recordTitle}
          </Drawer.Title>
          <Drawer.Description className="mt-0.5 truncate type-subhead text-muted-foreground">
            {editing
              ? `${personName} · ${datedLabel(editing.measuredOn, today, locale)}`
              : personName}
          </Drawer.Description>
        </div>
        <Drawer.Close
          disabled={pending}
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
      {/* The popup's overshoot fill would add scroll height, so scroll here. */}
      <form
        className="flex min-h-0 flex-col overflow-y-auto px-4"
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
          void run(editing ? t.updated : t.saved, () =>
            record({
              personId,
              measuredOn: date,
              weightKg,
              expectedEditRevision: existing?.editRevision,
            }),
          )
        }}
      >
        <fieldset disabled={pending} className="min-w-0 space-y-4 pt-2 pb-5">
          {editing ? null : (
            <Field label={t.date}>
              <DatePicker
                value={date}
                onChange={setDate}
                ariaLabel={t.dateLabel}
                label={datedLabel(date, today, locale)}
                className="w-full"
              />
            </Field>
          )}
          {!editing && existing ? (
            // Said before the field, so nobody replaces a weight unawares.
            <p className="px-4 type-subhead text-foreground" role="status">
              {t.replacesExisting(formatKg(existing.weightKg, locale))}
            </p>
          ) : null}
          <Field label={t.weight} htmlFor="weight-kg">
            <UnitInput
              id="weight-kg"
              ref={inputRef}
              unit="kg"
              // Text, not a number field: comma-decimal phones type "82,4".
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              className="font-semibold"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={showError && error ? true : undefined}
              aria-describedby={showError && error ? errorId : undefined}
            />
            {showError && error ? (
              <p id={errorId} className="px-4 type-footnote text-destructive">
                {error}
              </p>
            ) : null}
          </Field>
        </fieldset>
        <SheetFooter>
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              className="mr-auto -ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
              {t.delete}
            </Button>
          ) : null}
          <Button type="submit" size="lg" disabled={pending || !text.trim()}>
            {t.save}
          </Button>
        </SheetFooter>
      </form>
      {editing ? (
        <ConfirmDestructiveDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          disabled={pending}
          title={t.confirmTitle}
          description={t.confirmDescription(
            formatKg(editing.weightKg, locale),
            datedLabel(editing.measuredOn, today, locale),
          )}
          onConfirm={() => {
            setConfirmDelete(false)
            void run(t.deleted, () =>
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
