import { Check, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type SearchableOption = {
  value: string
  label: string
  keywords?: string
}

type SearchablePickerProps = {
  options: SearchableOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  emptyMessage?: string
  className?: string
}

export function SearchablePicker({
  options,
  value,
  onValueChange,
  placeholder = 'Search...',
  emptyMessage = 'No matches',
  className,
}: SearchablePickerProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = options.find((option) => option.value === value)
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return options.slice(0, 40)
    }
    return options
      .filter((option) => {
        const haystack = `${option.label} ${option.keywords ?? ''}`.toLowerCase()
        return haystack.includes(needle)
      })
      .slice(0, 40)
  }, [options, query])

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
        <Input
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setTimeout(() => setOpen(false), 100)
          }}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={selected ? `${selected.label} (search to change)` : placeholder}
          className="pl-8"
        />
      </div>

      {open ? (
        <div className="bg-popover max-h-56 overflow-auto rounded-md border p-1 shadow-sm">
          {filteredOptions.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1 text-sm">{emptyMessage}</p>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  onValueChange(option.value)
                  setQuery('')
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm',
                  'hover:bg-accent hover:text-accent-foreground',
                  option.value === value && 'bg-accent/60 text-accent-foreground',
                )}
              >
                <span className="truncate">{option.label}</span>
                {option.value === value ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
