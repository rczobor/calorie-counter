import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Capsules on one height scale: 36 (dense desktop), 40 (secondary), 44 (the
// default touch target) and 50 (a sheet's primary action). Every label uses
// the 15px medium control size; only that 50px primary steps up to the 17px
// semibold headline, as a sheet's one filled action.
const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-[color,background-color,box-shadow,opacity] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:opacity-70 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Disabled is a button that is off, never a faded primary: a neutral
        // fill a clear step from its surface and a dim label, never an
        // outline (that is the secondary style).
        default:
          'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100',
        // The one secondary action, on the page and inside cells: an
        // outlined, cell-coloured capsule. The tint is reserved for Log
        // meal, filled saves, the selected tab and focus; a grey fill only
        // ever means a disabled primary.
        outline:
          'bg-card text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_oklch(0_0_0/0.06)] hover:bg-accent aria-expanded:bg-accent',
        // No fill when open: a grey capsule would read as a disabled primary.
        // Menus show their popover and disclosures turn their chevron instead.
        ghost: 'hover:bg-muted hover:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:ring-destructive/30 dark:bg-destructive/20 dark:hover:bg-destructive/25',
        link: 'text-foreground underline underline-offset-4',
      },
      size: {
        default:
          "h-11 gap-2 px-4 text-sm [&_svg:not([class*='size-'])]:size-[1.125rem]",
        xs: "h-9 gap-1.5 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        sm: "h-10 gap-1.5 px-3.5 text-sm [&_svg:not([class*='size-'])]:size-4",
        // A prefilled choice that opens a picker (person, date, sort): a
        // leading glyph, the value, then a chevron set closer to the edge.
        chip: "h-10 gap-1.5 pr-3 pl-3.5 text-sm tabular-nums [&_svg:not([class*='size-'])]:size-4",
        lg: "h-[3.125rem] gap-2 px-5 text-base font-semibold [&_svg:not([class*='size-'])]:size-5",
        icon: "size-11 [&_svg:not([class*='size-'])]:size-5",
        'icon-xs': "size-9 [&_svg:not([class*='size-'])]:size-4",
        'icon-sm': "size-10 [&_svg:not([class*='size-'])]:size-[1.125rem]",
        'icon-lg': "size-[3.125rem] [&_svg:not([class*='size-'])]:size-6",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/** The chip token (person, date and sort pickers) for non-Button triggers. */
const chipClass = buttonVariants({ variant: 'outline', size: 'chip' })

export { Button, buttonVariants, chipClass }
