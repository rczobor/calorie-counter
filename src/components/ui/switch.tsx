import { Switch as SwitchPrimitive } from '@base-ui/react/switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default'
}) {
  // "On" is an ink track, not the tint: the tint marks only Log meal, filled
  // saves, the selected tab and focus. Dark mode inverts the thumb to match.
  // "Off" is the light muted fill (an elevated grey in dark) inside an
  // outline in the field colour, so off reads as empty, never as on or
  // disabled: the outline is ≥ 3:1 against every surface a switch sits on.
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-[background-color,box-shadow] outline-none after:absolute after:-inset-x-2 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:ring-2 aria-invalid:ring-destructive/20 data-[size=default]:h-7 data-[size=default]:w-12 data-[size=sm]:h-6 data-[size=sm]:w-10 data-checked:bg-foreground data-unchecked:bg-muted data-unchecked:shadow-[inset_0_0_0_1px_var(--input)] data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-white shadow-[0_2px_6px_oklch(0_0_0/0.2),0_0_0_0.5px_oklch(0_0_0/0.05)] transition-transform group-data-[size=default]/switch:size-6 group-data-[size=sm]/switch:size-5 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-4 data-unchecked:translate-x-0 dark:data-checked:bg-background"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
