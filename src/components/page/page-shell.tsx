import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const SHELL_BACKGROUND_CLASS = 'flex-1 bg-background'

const WIDTH_CLASS_MAP = {
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
} as const

type PageShellProps = {
  title?: string
  /** Replaces the title and subtitle, e.g. with a page-specific title control. */
  header?: ReactNode
  breadcrumbs?: ReactNode
  subtitle?: string
  eyebrow?: string
  maxWidth?: keyof typeof WIDTH_CLASS_MAP
  showArchived?: boolean
  onShowArchivedChange?: (checked: boolean) => void
  showArchivedLabel?: string
  children: ReactNode
  contentClassName?: string
  headerClassName?: string
}

export function PageShell({
  title,
  header,
  breadcrumbs,
  subtitle,
  maxWidth = '7xl',
  showArchived,
  onShowArchivedChange,
  showArchivedLabel = 'Show archived',
  children,
  contentClassName,
  headerClassName,
}: PageShellProps) {
  return (
    <main className={SHELL_BACKGROUND_CLASS}>
      <section
        className={cn(
          'mx-auto w-full px-4 py-5 sm:px-6 sm:py-6',
          WIDTH_CLASS_MAP[maxWidth],
          contentClassName,
        )}
      >
        {breadcrumbs}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3',
            headerClassName,
          )}
        >
          {header ?? (
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              {subtitle ? (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          )}
          {typeof showArchived === 'boolean' && onShowArchivedChange ? (
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => onShowArchivedChange(event.target.checked)}
                className="accent-primary"
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
}
