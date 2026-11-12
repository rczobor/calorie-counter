import { UserRound } from 'lucide-react'

import { StatusBadge } from '@/components/page/status-badge'
import { Select, type SelectOption } from '@/components/ui/select'
import { useMessages } from '@/i18n/messages'
import { messages } from './person-picker.messages'

type PersonPickerProps<Value extends string> = {
  /** `you` marks the signed-in member's own person with the "You" badge. */
  options: (SelectOption<Value> & { you?: boolean })[]
  value: Value | null
  onValueChange: (value: Value | null) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * The one person picker: the chip token with a person icon, the current
 * name and a chevron, opening a list over the page (Today, History, the
 * logging sheet, archived meals).
 */
export function PersonPicker<Value extends string>(
  props: PersonPickerProps<Value>,
) {
  const t = useMessages(messages)
  const current = props.options.find((option) => option.value === props.value)
  const name = current?.you ? t.nameYou(current.label) : current?.label
  return (
    <Select
      variant="chip"
      icon={<UserRound aria-hidden="true" />}
      className="max-w-full *:data-[slot=select-value]:max-w-44"
      options={props.options.map(({ you, ...option }) =>
        you ? { ...option, badge: <YouBadge />, hint: t.you } : option,
      )}
      value={props.value}
      onValueChange={props.onValueChange}
      placeholder={props.placeholder ?? t.selectPerson}
      ariaLabel={t.switchPerson(name ?? props.placeholder ?? t.selectPerson)}
      disabled={props.disabled}
    />
  )
}

function YouBadge() {
  return <StatusBadge status="You" className="shrink-0" />
}
