import { PageShell } from '@/components/page/page-shell'

type ConfigMissingStateProps = {
  title?: string
  description?: string
}

export function ConfigMissingState({
  title = 'Connect Convex First',
  description = 'Add VITE_CONVEX_URL and CONVEX_DEPLOYMENT in .env.local, then reload.',
}: ConfigMissingStateProps) {
  return (
    <PageShell title={title} maxWidth="6xl">
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </PageShell>
  )
}

type EmptyStateProps = {
  title: string
  description: string
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="py-6 text-center">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
