import { Combobox } from '@base-ui/react/combobox'
import { Check, LoaderCircle, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const DEFAULT_RESULT_LIMIT = 40

export type SearchableOption = {
  value: string
  label: string
  keywords?: string
}

export type SearchablePickerProps = {
  options: SearchableOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  ariaLabel?: string
  className?: string
  searchValue?: string
  onSearchValueChange?: (value: string) => void
  loading?: boolean
  loadingMessage?: string
  resultLimit?: number
}

function normalizeResultLimit(resultLimit: number) {
  if (!Number.isFinite(resultLimit)) {
    return DEFAULT_RESULT_LIMIT
  }

  return Math.max(0, Math.floor(resultLimit))
}

export function SearchablePicker({
  options,
  value,
  onValueChange,
  placeholder = 'Search...',
  emptyMessage = 'No matches',
  ariaLabel,
  className,
  searchValue,
  onSearchValueChange,
  loading = false,
  loadingMessage = 'Loading options...',
  resultLimit = DEFAULT_RESULT_LIMIT,
}: SearchablePickerProps) {
  const [internalSearchValue, setInternalSearchValue] = useState('')
  const [open, setOpen] = useState(false)
  const isSearchControlled = searchValue !== undefined
  const currentSearchValue = isSearchControlled
    ? searchValue
    : internalSearchValue
  const selected = options.find((option) => option.value === value) ?? null
  const normalizedResultLimit = normalizeResultLimit(resultLimit)

  const visibleOptions = useMemo(() => {
    if (loading && !isSearchControlled) {
      return []
    }

    if (isSearchControlled) {
      return options.slice(0, normalizedResultLimit)
    }

    const needle = currentSearchValue.trim().toLowerCase()
    const matches = needle
      ? options.filter((option) => {
          const haystack =
            `${option.label} ${option.keywords ?? ''}`.toLowerCase()
          return haystack.includes(needle)
        })
      : options

    return matches.slice(0, normalizedResultLimit)
  }, [
    currentSearchValue,
    isSearchControlled,
    loading,
    normalizedResultLimit,
    options,
  ])

  const updateSearchValue = (nextValue: string) => {
    if (!isSearchControlled) {
      setInternalSearchValue(nextValue)
    }
    onSearchValueChange?.(nextValue)
  }

  return (
    <Combobox.Root<SearchableOption>
      items={options}
      filteredItems={visibleOptions}
      open={open}
      onOpenChange={setOpen}
      value={selected}
      onValueChange={(nextOption) => {
        if (!nextOption) {
          return
        }

        onValueChange(nextOption.value)
      }}
      inputValue={currentSearchValue}
      onInputValueChange={(nextValue, eventDetails) => {
        if (eventDetails.reason === 'input-change') {
          updateSearchValue(nextValue)
        } else if (
          eventDetails.reason === 'input-clear' ||
          eventDetails.reason === 'item-press'
        ) {
          updateSearchValue('')
        }
      }}
      itemToStringLabel={(option) => option.label}
      itemToStringValue={(option) => option.value}
      isItemEqualToValue={(option, selectedOption) =>
        option.value === selectedOption.value
      }
      autoHighlight
      loopFocus={false}
    >
      <div className={cn('w-full min-w-0 space-y-2', className)}>
        <div className="relative">
          {loading ? (
            <LoaderCircle
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 animate-spin"
            />
          ) : (
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
            />
          )}
          <Combobox.Input
            render={<Input />}
            aria-label={ariaLabel ?? placeholder}
            aria-busy={loading}
            placeholder={placeholder}
            className="pl-8"
            onFocus={() => setOpen(true)}
          />
        </div>

        {selected ? (
          <div
            aria-live="polite"
            className="flex items-start gap-1 rounded-md border border-emerald-400/35 bg-emerald-500/8 px-2 py-1 text-xs text-foreground dark:border-emerald-400/25 dark:bg-emerald-400/10"
          >
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
            <span className="min-w-0 wrap-break-word">
              Selected:{' '}
              <span className="font-medium" title={selected.label}>
                {selected.label}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <Combobox.Portal>
        <Combobox.Positioner
          align="start"
          side="bottom"
          sideOffset={4}
          className="isolate z-50"
        >
          <Combobox.Popup className="w-(--anchor-width) min-w-40 rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden">
            <Combobox.Status className="text-muted-foreground px-3 py-2 text-sm">
              {loading ? loadingMessage : null}
            </Combobox.Status>
            <Combobox.Empty className="text-muted-foreground px-3 py-2 text-sm">
              {loading ? null : emptyMessage}
            </Combobox.Empty>
            <Combobox.List className="max-h-56 overflow-y-auto p-1">
              {visibleOptions.map((option, index) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  index={index}
                  className="relative flex w-full cursor-default items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:bg-accent/60 data-selected:text-accent-foreground"
                >
                  <span className="pr-2 wrap-break-word">{option.label}</span>
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="h-3.5 w-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              ))}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
