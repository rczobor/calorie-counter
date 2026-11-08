import type { ErrorComponentProps } from '@tanstack/react-router'
import { PageShell } from '@/components/page/page-shell'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { toErrorMessage } from '@/lib/nutrition'
import { messages } from './page-states.messages'

type ConfigMissingStateProps = {
  title?: string
  description?: string
}

export function ConfigMissingState({
  title,
  description,
}: ConfigMissingStateProps) {
  const t = useMessages(messages)
  return (
    <PageShell title={title ?? t.configMissingTitle} maxWidth="6xl">
      <div className="mt-4">
        <p className="text-sm text-muted-foreground">
          {description ?? t.configMissingDescription}
        </p>
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

// Default route error screen. Keeps the app shell and navigation usable when a
// page's query throws.
export function RouteErrorState({ error, reset }: ErrorComponentProps) {
  const locale = useLocale()
  const t = messages[locale]
  return (
    <PageShell title={t.errorTitle}>
      <p role="alert" className="mt-4 text-sm text-destructive">
        {t.pageLoadFailed(toErrorMessage(error, locale))}
      </p>
      <Button className="mt-3" variant="outline" onClick={reset}>
        {t.retry}
      </Button>
    </PageShell>
  )
}
