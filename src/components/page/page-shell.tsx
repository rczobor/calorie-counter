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
  children,
  contentClassName,
  headerClassName,
}: PageShellProps) {
  return (
    <main className={SHELL_BACKGROUND_CLASS}>
      {/* Phones have no app bar, so a page opens on its large title. */}
      <section
        className={cn(
          'mx-auto w-full px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-6 sm:px-6 md:pt-8',
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
              <h1 className="type-large-title text-foreground">{title}</h1>
              {subtitle ? (
                <p className="mt-1 type-subhead text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {children}
      </section>
    </main>
  )
}

export const pageShellClasses = {
  background: SHELL_BACKGROUND_CLASS,
}
