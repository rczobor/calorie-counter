import type { ReactNode } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
      <div className="mt-3">
        <Card className="mx-auto max-w-3xl border-border bg-card">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        </Card>
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
      <div className="mt-3 space-y-3">
        {children ?? (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              <Card className="border-border/70 bg-card/90">
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card/90">
                <CardHeader>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            </div>
          </>
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
    <Card className="border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
