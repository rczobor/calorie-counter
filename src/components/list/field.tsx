import type { ComponentProps, ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * A visible label above a control. Pass `htmlFor` for native inputs; the
 * select primitive names itself with `ariaLabel`, so its label stays text.
 */
export function Field({
  label,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      {htmlFor ? (
        <Label htmlFor={htmlFor}>{label}</Label>
      ) : (
        <span className="block px-4 type-subhead font-medium text-foreground">
          {label}
        </span>
      )}
      {children}
      {hint ? (
        <p className="px-4 type-footnote text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * A number field that shows its unit inside the field, right after the
 * digits ("2000 kcal"), never pinned to the far edge where a wide field
 * would separate them. An invisible copy of the value, in the field's own
 * type, sets where the unit starts.
 */
export function UnitInput({
  unit,
  className,
  ...props
}: ComponentProps<typeof Input> & {
  unit: string
  /** Type classes only (such as font-semibold): the unit's position copies it. */
  className?: string
}) {
  const shown = String(props.value ?? '') || String(props.placeholder ?? '')
  // The right padding only holds the unit for a full field, so narrow fields
  // (the logging sheet's grams) keep room for their digits.
  const roomForUnit =
    unit.length <= 1 ? 'pr-8' : unit.length <= 2 ? 'pr-10' : 'pr-12'
  return (
    // A few digits and a unit: on wide screens the field stays that size.
    <div className="relative md:max-w-60">
      <Input
        type="number"
        inputMode="decimal"
        {...props}
        className={cn(roomForUnit, 'tabular-nums', className)}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2 left-0 flex items-center overflow-hidden pl-[calc(1rem+1px)] text-base whitespace-pre tabular-nums md:text-sm"
      >
        {/* Matches the field's padding, size and weight, so it ends where the
            typed value ends. */}
        <span className={cn('invisible', className)}>{shown}</span>
        <span className="ml-1.5 type-subhead text-muted-foreground">
          {unit}
        </span>
      </span>
    </div>
  )
}
