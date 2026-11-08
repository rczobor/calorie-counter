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

/** A number field that shows its unit inside the field ("kcal", "g"). */
export function UnitInput({
  unit,
  className,
  ...props
}: ComponentProps<typeof Input> & { unit: string }) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        {...props}
        className={cn('pr-12 tabular-nums', className)}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 type-subhead text-muted-foreground"
      >
        {unit}
      </span>
    </div>
  )
}
