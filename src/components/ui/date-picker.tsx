import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { lazy, Suspense, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

const Calendar = lazy(async () => ({
  default: (await import('./calendar')).Calendar,
}))

type DatePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
  disabled?: boolean
  /** Replaces the app's short date shown in the trigger. */
  label?: ReactNode
  /** `chip`: a prefilled choice, the same outline capsule as a chip `Select`. */
  variant?: 'outline' | 'ghost' | 'chip'
}

function parseLocalDate(value: string) {
  if (!value) {
    return undefined
  }

  const parts = value.split('-')
  if (parts.length !== 3) {
    return undefined
  }

  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return undefined
  }

  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return undefined
  }
  return date
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  ariaLabel,
  className,
  disabled,
  label,
  variant = 'outline',
}: DatePickerProps) {
  const date = parseLocalDate(value)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={variant === 'chip' ? 'outline' : variant}
            size={variant === 'chip' ? 'chip' : 'default'}
            data-empty={!date}
            className={cn(
              'data-[empty=true]:text-muted-foreground justify-start text-left',
              // A field reads like the inputs beside it. A chip's date is
              // prose, so its figures are proportional, and with no leading
              // glyph it pads 12px on both sides.
              variant === 'chip'
                ? 'pl-3 proportional-nums'
                : 'text-base font-normal md:text-sm',
              className,
            )}
            aria-label={ariaLabel ?? placeholder}
            disabled={disabled}
          >
            {/* A chip's date names itself and its chevron marks the picker,
                so it carries no calendar glyph: the year-long Today pill
                must share a 390px row with Today and both arrows. */}
            {variant === 'chip' ? null : <CalendarIcon />}
            {date ? (
              (label ?? formatDate(date.getTime()))
            ) : (
              <span>{placeholder}</span>
            )}
            {/* A picker that opens carries a chevron, like the person chip. */}
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-4 text-muted-foreground"
            />
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0">
        <Suspense
          fallback={
            <div role="status" className="h-80 w-64 p-3">
              Loading calendar…
            </div>
          }
        >
          <Calendar
            autoFocus
            mode="single"
            selected={date}
            onSelect={(selectedDate) => {
              if (selectedDate) {
                onChange(toLocalDateKey(selectedDate))
              }
            }}
          />
        </Suspense>
      </PopoverContent>
    </Popover>
  )
}
