import { Flame } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'

export function AppPending() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex-1 bg-background px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-10 sm:px-6 md:pt-8"
    >
      <section className="mx-auto w-full max-w-3xl inset-group p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-[0.625rem] bg-primary text-primary-foreground">
            <Flame aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="type-footnote text-muted-foreground">Loading</p>
            <h1 className="type-title text-foreground">
              Preparing your dashboard
            </h1>
          </div>
          <Spinner className="ml-auto size-5 text-muted-foreground" />
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-2 w-5/6 rounded-full" />
          <Skeleton className="h-2 w-2/3 rounded-full" />
        </div>
      </section>
    </main>
  )
}
