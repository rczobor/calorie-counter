import { Flame } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'

export function AppPending() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="min-h-[calc(100vh-4rem)] bg-background px-4 py-10 sm:px-6"
    >
      <section className="mx-auto w-full max-w-3xl rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted">
            <Flame className="h-5 w-5 text-foreground/80" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Loading
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Preparing your dashboard
            </h1>
          </div>
          <Spinner className="ml-auto size-5 text-foreground/70" />
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-2 w-5/6 rounded-full" />
          <Skeleton className="h-2 w-2/3 rounded-full" />
        </div>
      </section>
    </main>
  )
}
