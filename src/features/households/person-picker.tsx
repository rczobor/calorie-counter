import { ChevronDown, UserRound } from 'lucide-react'
import type { Ref } from 'react'

import { chipClass } from '@/components/ui/button'
import { Select, type SelectOption } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useMessages } from '@/i18n/messages'
import { messages } from './person-picker.messages'

type PersonSelectProps<Value extends string> = {
  options: SelectOption<Value>[]
  value: Value | null
  onValueChange: (value: Value | null) => void
  placeholder?: string
  disabled?: boolean
}

type PersonDisclosureProps = {
  /** The person in focus; the placeholder shows until there is one. */
  name?: string
  placeholder?: string
  expanded: boolean
  /** The id of the panel it opens. */
  controls: string
  onToggle: () => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * The one person picker: the chip token with a person icon, the current
 * name and a chevron. Given `options` it is a select (History, the logging
 * sheet, archived meals); otherwise it discloses a panel, as Today's
 * household intake does.
 */
export function PersonPicker<Value extends string>(
  props: PersonSelectProps<Value> | PersonDisclosureProps,
) {
  const t = useMessages(messages)
  if ('options' in props) {
    const name = props.options.find(
      (option) => option.value === props.value,
    )?.label
    return (
      <Select
        variant="chip"
        icon={<UserRound aria-hidden="true" />}
        className="max-w-full *:data-[slot=select-value]:max-w-36"
        options={props.options}
        value={props.value}
        onValueChange={props.onValueChange}
        placeholder={props.placeholder ?? t.selectPerson}
        ariaLabel={t.switchPerson(name ?? props.placeholder ?? t.selectPerson)}
        disabled={props.disabled}
      />
    )
  }
  const { name, placeholder, expanded, controls, onToggle, ref } = props
  return (
    <button
      ref={ref}
      type="button"
      className={cn(chipClass, 'max-w-full')}
      aria-label={t.switchPerson(name ?? placeholder)}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <UserRound aria-hidden="true" />
      {/* Long names truncate, so the pill never squeezes a title beside it. */}
      <span
        className={cn('max-w-36 truncate', !name && 'text-muted-foreground')}
      >
        {name ?? placeholder}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          'size-4 text-muted-foreground transition-transform motion-reduce:transition-none',
          expanded && 'rotate-180',
        )}
      />
    </button>
  )
}
