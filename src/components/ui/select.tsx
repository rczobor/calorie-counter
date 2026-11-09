import { Select as SelectPrimitive } from '@base-ui/react/select'
import type { ComponentProps, ReactNode } from 'react'

import { chipClass } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

const SelectRoot = SelectPrimitive.Root

export type SelectOption<Value extends string = string> = {
  value: Value
  label: string
  /** A status capsule after the label in the open list. */
  badge?: ReactNode
  /** The same status as quiet text in the closed trigger, beside the label. */
  hint?: string
  disabled?: boolean
}

type SelectProps<Value extends string = string> = {
  options: SelectOption<Value>[]
  value?: Value | null
  onValueChange?: (value: Value | null) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
  size?: 'sm' | 'default'
  /** `chip`: a prefilled choice shown as an outline capsule, like the buttons beside it. */
  variant?: 'field' | 'chip'
  /** A leading glyph that says what the choice is, such as a person icon. */
  icon?: ReactNode
} & Omit<
  SelectPrimitive.Root.Props<Value, false>,
  'children' | 'items' | 'value' | 'onValueChange' | 'multiple'
>

function Select<Value extends string = string>({
  options,
  value = null,
  onValueChange,
  placeholder,
  ariaLabel,
  className,
  size = 'default',
  variant = 'field',
  icon,
  ...rootProps
}: SelectProps<Value>) {
  const hasEmptyOption = options.some(
    (option) => option.value === ('' as Value),
  )
  const normalizedValue =
    value === '' && !hasEmptyOption ? (null as Value | null) : value

  return (
    <SelectRoot
      items={options}
      value={normalizedValue}
      onValueChange={(nextValue) =>
        onValueChange?.((nextValue ?? null) as Value | null)
      }
      {...rootProps}
    >
      <SelectTrigger
        className={cn(variant === 'chip' && SELECT_CHIP_CLASS, className)}
        size={size}
        aria-label={ariaLabel ?? placeholder}
      >
        {icon}
        <SelectValue placeholder={placeholder}>
          {options.some((option) => option.hint)
            ? (selectedValue: Value | null) => {
                const option = options.find(
                  (candidate) => candidate.value === selectedValue,
                )
                if (!option) return placeholder
                return (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{option.label}</span>
                    {option.hint ? (
                      <span className="shrink-0 text-muted-foreground">
                        · {option.hint}
                      </span>
                    ) : null}
                  </span>
                )
              }
            : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option, index) => (
            <SelectItem
              key={`${index}-${String(option.value)}`}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
              {option.badge}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </SelectRoot>
  )
}

// The chip token the date and person pickers share, so they draw one edge,
// size and fill. The trigger's own height wins by specificity, hence the
// data-size override.
const SELECT_CHIP_CLASS = cn(chipClass, 'data-[size=default]:h-10')

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('scroll-my-1 p-1', className)}
      {...props}
    />
  )
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('flex flex-1 text-left', className)}
      {...props}
    />
  )
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: SelectPrimitive.Trigger.Props & {
  size?: 'sm' | 'default'
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-full border border-input bg-control py-2 pr-3.5 pl-4 text-base whitespace-nowrap transition-[border-color,box-shadow,background-color] outline-none hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-11 data-[size=sm]:h-10 data-[size=sm]:text-sm md:text-sm *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon className="text-muted-foreground size-4 pointer-events-none" />
        }
      />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'
  >) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            'elevated relative z-50 max-h-(--available-height) min-w-44 w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-2xl bg-popover text-popover-foreground shadow-[0_12px_40px_-8px_oklch(0_0_0/0.25)] ring-1 ring-foreground/8 duration-100 data-[align-trigger=true]:animate-none data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=inline-end]:slide-in-from-left-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-3 py-2 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex min-h-11 w-full cursor-default items-center gap-2.5 rounded-md py-2 pr-9 pl-3 text-base outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 md:min-h-10 md:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.125rem] *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="flex flex-1 gap-2 shrink-0 whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center text-foreground">
            <CheckIcon className="pointer-events-none" />
          </span>
        }
      />
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
