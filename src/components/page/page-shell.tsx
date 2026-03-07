import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

const SHELL_BACKGROUND_CLASS =
  "min-h-[calc(100vh-4rem)] bg-background"
const HERO_CLASS =
  "rounded-lg border border-border bg-card p-6 shadow-sm"

const WIDTH_CLASS_MAP = {
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const

type PageShellProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  icon?: ReactNode
  maxWidth?: keyof typeof WIDTH_CLASS_MAP
  showArchived?: boolean
  onShowArchivedChange?: (checked: boolean) => void
  showArchivedLabel?: string
  children: ReactNode
  contentClassName?: string
}

export function PageShell({
  title,
  subtitle,
  eyebrow,
  icon,
  maxWidth = "7xl",
  showArchived,
  onShowArchivedChange,
  showArchivedLabel = "Show archived records",
  children,
  contentClassName,
}: PageShellProps) {
  return (
    <main className={SHELL_BACKGROUND_CLASS}>
      <section
        className={cn(
          "mx-auto w-full px-4 py-8 sm:px-6",
          WIDTH_CLASS_MAP[maxWidth],
          contentClassName,
        )}
      >
        <div className={HERO_CLASS}>
          {eyebrow ? (
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {icon}
              {eyebrow}
            </p>
          ) : null}
          <h1 className={cn("text-4xl font-semibold tracking-tight text-foreground", eyebrow ? "mt-2" : "")}>
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p> : null}
          {typeof showArchived === "boolean" && onShowArchivedChange ? (
            <label className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => onShowArchivedChange(event.target.checked)}
              />
              {showArchivedLabel}
            </label>
          ) : null}
        </div>

        {children}
      </section>
    </main>
  )
}

export const pageShellClasses = {
  background: SHELL_BACKGROUND_CLASS,
  hero: HERO_CLASS,
}
