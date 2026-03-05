import * as React from "react"

import { cn } from "@/lib/utils"

const SHELL_BACKGROUND_CLASS =
  "min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_20%_10%,#fff7e4_0%,#f5f6f4_44%,#e8f0ea_100%)] dark:bg-[radial-gradient(circle_at_20%_10%,#1d2535_0%,#111a26_44%,#0a1119_100%)]"
const HERO_CLASS =
  "rounded-2xl border border-amber-200/80 bg-card/85 p-6 shadow-sm dark:border-amber-500/25"

const WIDTH_CLASS_MAP = {
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const

type PageShellProps = {
  title: string
  subtitle?: string
  eyebrow?: string
  icon?: React.ReactNode
  maxWidth?: keyof typeof WIDTH_CLASS_MAP
  showArchived?: boolean
  onShowArchivedChange?: (checked: boolean) => void
  showArchivedLabel?: string
  children: React.ReactNode
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
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-amber-700">
              {icon}
              {eyebrow}
            </p>
          ) : null}
          <h1 data-display="true" className={cn("text-4xl text-foreground", eyebrow ? "mt-2" : "")}>
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
