import { Search, X } from 'lucide-react'
import { useRef, type ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type SearchFieldProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'aria-label'
> & {
  label: string
  value: string
  onValueChange: (value: string) => void
}

/**
 * The one search look, in the logging sheet and on every list page: a
 * capsule with a leading icon and a muted clear button. A text field with its
 * own clear button, because the native search clear takes the primary colour.
 * The placeholder is iOS's plain "Search" (the page names what it lists), so
 * the field still reads when it shares a row; `label` stays its name.
 */
export function SearchField({
  label,
  value,
  onValueChange,
  placeholder,
  className,
  ...props
}: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...props}
        ref={inputRef}
        aria-label={label}
        placeholder={placeholder ?? 'Search'}
        enterKeyHint="search"
        className={cn('rounded-full pl-10', value ? 'pr-11' : 'pr-3.5')}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <Button
          size="icon-xs"
          variant="ghost"
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
          aria-label="Clear search"
          onClick={() => {
            onValueChange('')
            inputRef.current?.focus()
          }}
        >
          <X />
        </Button>
      ) : null}
    </div>
  )
}
