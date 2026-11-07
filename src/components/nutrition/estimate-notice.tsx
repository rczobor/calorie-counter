import { Info } from 'lucide-react'

import type { NutritionProvenance } from '@/lib/nutrition'
import { cn } from '@/lib/utils'

export function EstimateNotice({
  provenance,
}: {
  provenance?: NutritionProvenance
}) {
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
        <Info aria-hidden="true" className="size-3.5" />
        {provided ? 'Nutrition source' : 'Estimated'}
      </summary>
      <p className="mt-1 whitespace-pre-wrap">
        {provenance.source}: {provenance.assumptions}
      </p>
    </details>
  )
}
