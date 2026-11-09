import { ArrowDownUp, Plus } from 'lucide-react'
import type { ReactNode } from 'react'

import { SearchField } from '@/components/list/search-field'
import { Button } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useMessages } from '@/i18n/messages'
import { messages } from './list-toolbar.messages'

export type ArchivedToggle = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

/**
 * The controls above every list, in one fixed layout so pages can't drift.
 * Row 1: the search, with a framed sort capsule when the list sorts. A create
 * action adds row 2: "New <noun>" on the left, Show archived on the right.
 * Without one, Show archived joins the search row, so no control sits alone
 * on a half-empty row. Search, sort and Show archived don't fit one 360px
 * row, so that trio puts sort and Show archived on row 2 together. Pages pass
 * what they have, not markup. An `empty` list (nothing yet, no search, no
 * archive shown) keeps only the create action: there is nothing to search,
 * and its empty state offers a quiet Show archived instead.
 */
export function ListToolbar<Sort extends string = string>({
  search: searchProp,
  sort: sortProp,
  create,
  archived: archivedProp,
  empty = false,
}: {
  search?: {
    label: string
    value: string
    onValueChange: (value: string) => void
    maxLength?: number
  }
  sort?: {
    /** The select's name, such as "Sort ingredients". */
    label: string
    value: Sort
    options: SelectOption<Sort>[]
    onValueChange: (value: Sort) => void
  }
  create?: { noun: string; onClick: () => void; disabled?: boolean }
  archived?: ArchivedToggle
  empty?: boolean
}) {
  const t = useMessages(messages)
  const search = empty ? undefined : searchProp
  const sort = empty ? undefined : sortProp
  const archived = empty ? undefined : archivedProp
  // Nothing left to show: no empty row, so the page keeps its rhythm.
  if (!search && !create && !archived) return null
  const crowded = Boolean(search && sort && archived && !create)
  const secondRow = Boolean(create) || crowded || !search
  const sortControl = sort ? (
    // The chip token at the search field's height.
    <Select
      variant="chip"
      icon={<ArrowDownUp aria-hidden="true" />}
      className="shrink-0 data-[size=default]:h-11"
      ariaLabel={sort.label}
      value={sort.value}
      options={sort.options}
      onValueChange={(value) => {
        if (value) sort.onValueChange(value)
      }}
    />
  ) : null
  const archivedControl = archived ? (
    <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2.5 type-subhead text-foreground">
      {t.showArchived}
      <Switch
        checked={archived.checked}
        disabled={archived.disabled}
        onCheckedChange={(next) => archived.onCheckedChange(Boolean(next))}
      />
    </label>
  ) : null
  return (
    <div className="space-y-2">
      {search ? (
        <div className="flex items-center gap-3">
          <SearchField
            className="flex-1"
            label={search.label}
            maxLength={search.maxLength}
            value={search.value}
            onValueChange={search.onValueChange}
          />
          {crowded ? null : sortControl}
          {secondRow ? null : archivedControl}
        </div>
      ) : null}
      {secondRow && (create || archived) ? (
        // Below a 360px phone, "New <noun>" and the switch can't share a
        // row even with the label wrapped; wrap rather than scroll sideways.
        <div className="flex min-h-11 items-center gap-x-3 gap-y-2 max-[359px]:flex-wrap">
          {create ? (
            <Button
              variant="outline"
              className="shrink-0 pr-4.5 pl-3.5"
              disabled={create.disabled}
              onClick={create.onClick}
            >
              {/* The neutral secondary capsule: the tint is reserved for Log
                  meal, filled saves, the selected tab and focus. */}
              <Plus aria-hidden="true" />
              {t.create(create.noun)}
            </Button>
          ) : null}
          {crowded ? sortControl : null}
          {archivedControl}
        </div>
      ) : null}
    </div>
  )
}

/** Show archived for an empty list, whose toolbar hides the switch. */
export function ShowArchivedButton({ onClick }: { onClick: () => void }) {
  const t = useMessages(messages)
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      {t.showArchived}
    </Button>
  )
}

export function LoadMoreButton({
  loading = false,
  onClick,
  children,
}: {
  loading?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="mt-3 h-11 w-full sm:w-auto"
      disabled={loading}
      aria-busy={loading}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
