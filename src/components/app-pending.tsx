import { Flame } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

export function AppPending() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_18%_8%,#fdf6e7_0%,#f5f6f4_50%,#e8f1ea_100%)] px-4 py-10 sm:px-6 dark:bg-[radial-gradient(circle_at_18%_8%,#1d2535_0%,#111a26_50%,#0a1119_100%)]"
    >
      <section className="mx-auto w-full max-w-3xl rounded-2xl border border-amber-200/80 bg-card/90 p-6 shadow-sm dark:border-amber-500/30">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/60 bg-amber-500/10 dark:border-amber-500/40 dark:bg-amber-500/20">
            <Flame className="h-5 w-5 text-amber-500" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Loading
            </p>
            <h1 data-display="true" className="text-2xl text-foreground">
              Preparing your dashboard
            </h1>
          </div>
          <Spinner className="ml-auto size-5 text-amber-500" />
        </div>
        <div className="mt-5 space-y-2">
          <Skeleton className="h-2 w-5/6 rounded-full" />
          <Skeleton className="h-2 w-2/3 rounded-full" />
        </div>
      </section>
    </main>
  );
}
