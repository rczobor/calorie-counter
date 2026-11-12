import { createLucideIcon, Info } from 'lucide-react'

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMessages } from '@/i18n/messages'
import type { NutritionProvenance } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { messages } from './estimate-notice.messages'

export function EstimateNotice({
  provenance,
}: {
  provenance?: NutritionProvenance
}) {
  const t = useMessages(messages)
  if (!provenance) return null
  const provided = provenance.kind === 'provided'
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      {/* A supplied source is a note, not a warning; only estimates keep the caution colour. */}
      <summary
        className={cn(
          'inline-flex cursor-pointer list-none items-center gap-1 font-medium [&::-webkit-details-marker]:hidden',
          provided ? 'text-muted-foreground' : 'text-caution',
        )}
      >
        <NoticeGlyph provided={provided} className="size-3.5" />
        {provided ? t.nutritionSource : t.estimated}
      </summary>
      <p className="mt-1 whitespace-pre-wrap">
        {provenance.source}: {provenance.assumptions}
      </p>
    </details>
  )
}

// Lucide has no circled "≈", so this draws its approximately-equal waves,
// scaled to 70%, inside Info's circle: the two marks share one footprint and
// weight and differ in shape.
const CircleApproximately = createLucideIcon('circle-approximately', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'circle' }],
  [
    'path',
    { d: 'M7.1 9.9a4.55 4.55 0 0 1 4.9 0 4.55 4.55 0 0 0 4.9 0', key: 'upper' },
  ],
  [
    'path',
    {
      d: 'M7.1 14.1a4.55 4.55 0 0 1 4.9 0 4.55 4.55 0 0 0 4.9 0',
      key: 'lower',
    },
  ],
])

// An estimate and a supplied source differ in shape as well as colour, so
// neither relies on the amber alone.
function NoticeGlyph({
  provided,
  className,
}: {
  provided: boolean
  className: string
}) {
  const Glyph = provided ? Info : CircleApproximately
  return <Glyph aria-hidden="true" className={className} />
}

/**
 * The notice as an icon that sits inline after a name, for dense lists: its
 * label is the accessible name and the source opens on tap.
 */
export function EstimateNoticeIcon({
  provenance,
}: {
  provenance?: NutritionProvenance
}) {
  const t = useMessages(messages)
  if (!provenance) return null
  const provided = provenance.kind === 'provided'
  const label = provided ? t.nutritionSource : t.estimated
  return (
    <Popover>
      {/* A 24px target around the 16px glyph; the negative margin keeps it
          from growing the line it sits in. */}
      <PopoverTrigger
        aria-label={label}
        className={cn(
          '-my-1 inline-flex size-6 items-center justify-center rounded-full align-middle outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40',
          provided ? 'text-muted-foreground' : 'text-caution',
        )}
      >
        <NoticeGlyph provided={provided} className="size-4" />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 gap-1">
        <PopoverTitle
          className={cn(
            'type-subhead font-semibold',
            !provided && 'text-caution',
          )}
        >
          {label}
        </PopoverTitle>
        <PopoverDescription className="whitespace-pre-wrap type-footnote">
          {provenance.source}: {provenance.assumptions}
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}
