import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
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

type LoadingSkeletonStateProps = {
  title: string
  icon?: ReactNode
  maxWidth?: '6xl' | '7xl'
  children?: ReactNode
}

export function LoadingSkeletonState({
  title,
  icon,
  maxWidth = '7xl',
  children,
}: LoadingSkeletonStateProps) {
  return (
    <PageShell title={title} icon={icon} maxWidth={maxWidth}>
      <div className="mt-4 space-y-4">
        {children ?? (
          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1 h-3 w-40" />
              <div className="mt-3 space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
            <div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1 h-3 w-40" />
              <div className="mt-3 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </div>
        )}
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
