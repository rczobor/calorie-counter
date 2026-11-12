import { Combobox } from '@base-ui/react/combobox'
import { Check, LoaderCircle, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'
import { messages } from './searchable-picker.messages'

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
  placeholder,
  emptyMessage,
  ariaLabel,
  className,
  searchValue,
  onSearchValueChange,
  loading = false,
  loadingMessage,
  resultLimit = DEFAULT_RESULT_LIMIT,
}: SearchablePickerProps) {
  const t = useMessages(messages)
  const placeholderText = placeholder ?? t.placeholder
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
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 animate-spin"
            />
          ) : (
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
          )}
          <Combobox.Input
            render={<Input />}
            aria-label={ariaLabel ?? placeholderText}
            aria-busy={loading}
            placeholder={placeholderText}
            className="pl-9"
            onFocus={() => setOpen(true)}
          />
        </div>

        {selected ? (
          <div
            aria-live="polite"
            className="flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-foreground"
          >
            <Check className="mt-px size-4 shrink-0 text-foreground" />
            <span className="min-w-0 wrap-break-word">
              {t.selected}{' '}
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
          <Combobox.Popup className="elevated w-(--anchor-width) min-w-40 rounded-2xl bg-popover text-popover-foreground shadow-[0_12px_40px_-8px_oklch(0_0_0/0.25),0_2px_6px_-1px_oklch(0_0_0/0.1)] ring-1 ring-foreground/10 outline-hidden">
            <Combobox.Status className="text-muted-foreground px-3 py-2 text-sm">
              {loading ? (loadingMessage ?? t.loading) : null}
            </Combobox.Status>
            <Combobox.Empty className="text-muted-foreground px-3 py-2 text-sm">
              {loading ? null : (emptyMessage ?? t.empty)}
            </Combobox.Empty>
            <Combobox.List className="max-h-64 overflow-y-auto p-1.5">
              {visibleOptions.map((option, index) => (
                <Combobox.Item
                  key={option.value}
                  value={option}
                  index={index}
                  className="relative flex min-h-11 w-full cursor-default items-center justify-between rounded-md px-3 py-2 text-left text-base outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-medium md:min-h-10 md:text-sm"
                >
                  <span className="pr-2 wrap-break-word">{option.label}</span>
                  <Combobox.ItemIndicator className="shrink-0">
                    <Check className="size-4 text-foreground" />
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
