import {
  createFileRoute,
  useRouterState,
  type ErrorComponentProps,
} from '@tanstack/react-router'
import { DayDashboard } from '@/features/meals/day-dashboard'
import { ConfigMissingState } from '@/components/page/page-states'
import { PageShell } from '@/components/page/page-shell'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/i18n/locale'
import { isConvexConfigured } from '@/integrations/convex/config'
import { toErrorMessage } from '@/lib/nutrition'
import { messages } from './index.messages'

export const Route = createFileRoute('/')({
  ssr: false,
  component: MealDashboardPage,
  errorComponent: MealDashboardError,
})
function MealDashboardError({ error, reset }: ErrorComponentProps) {
  const locale = useLocale()
  const t = messages[locale]
  return (
    <PageShell title={t.title}>
      <p role="alert" className="mt-4 text-sm text-destructive">
        {t.loadFailed(toErrorMessage(error, locale))}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        {t.retry}
      </Button>
    </PageShell>
  )
}
function MealDashboardPage() {
  const search = useRouterState({ select: (state) => state.location.searchStr })
  if (!isConvexConfigured) return <ConfigMissingState />
  return <DayDashboard key={search} />
}
