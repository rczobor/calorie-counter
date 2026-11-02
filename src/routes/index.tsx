import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { DayDashboard } from '@/features/meals/day-dashboard'
import { ConfigMissingState } from '@/components/page/page-states'
import { PageShell } from '@/components/page/page-shell'
import { Button } from '@/components/ui/button'
import { isConvexConfigured } from '@/integrations/convex/config'
import { toErrorMessage } from '@/lib/nutrition'

export const Route = createFileRoute('/')({
  ssr: false,
  component: MealDashboardPage,
  errorComponent: ({ error, reset }) => (
    <PageShell title="Daily intake">
      <p role="alert" className="mt-4 text-sm text-destructive">
        Daily intake could not be loaded: {toErrorMessage(error)}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        Retry
      </Button>
    </PageShell>
  ),
})
function MealDashboardPage() {
  const search = useRouterState({ select: (state) => state.location.searchStr })
  if (!isConvexConfigured) return <ConfigMissingState />
  return <DayDashboard key={search} />
}
