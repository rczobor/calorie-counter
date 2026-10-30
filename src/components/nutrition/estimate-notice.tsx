export function EstimateNotice({
  provenance,
}: {
  provenance?: { source: string; assumptions: string }
}) {
  if (!provenance) return null
  return (
    <details className="mt-1 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-400">
        Estimated
      </summary>
      <p className="mt-1 whitespace-pre-wrap">
        {provenance.source}: {provenance.assumptions}
      </p>
    </details>
  )
}
