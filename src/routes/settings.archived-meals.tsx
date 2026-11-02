import { createFileRoute, useRouterState } from '@tanstack/react-router'
import { DayDashboard } from '@/features/meals/day-dashboard'
import { ConfigMissingState } from '@/components/page/page-states'
import { isConvexConfigured } from '@/integrations/convex/config'

export const Route = createFileRoute('/settings/archived-meals')({
  ssr: false,
  component: ArchivedMealsPage,
})
function ArchivedMealsPage() {
  const search = useRouterState({ select: (state) => state.location.searchStr })
  if (!isConvexConfigured) return <ConfigMissingState />
  return <DayDashboard key={search} archived />
}
