import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { PageShell } from '@/components/page/page-shell'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { HINT_DETAILS } from '@/features/hints/hints'
import { messages } from '@/features/hints/hints.messages'
import { useMessages } from '@/i18n/messages'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/settings/tips')({
  ssr: false,
  component: TipsPage,
})

// Every hint, for anyone who dismissed one or wants the tour on their own
// terms. Maintenance is a moment, not a tip: Weigh-ins covers it here.
const TIPS = ['assistant', 'history', 'weighIn', 'invite', 'widget'] as const

function TipsPage() {
  const t = useMessages(messages)
  return (
    <PageShell
      title={t.tips.title}
      subtitle={t.tips.intro}
      breadcrumbs={<SettingsBreadcrumbs current={t.tips.title} />}
      contentClassName="max-w-3xl"
    >
      <ul className="mt-6 inset-group inset-rows">
        {TIPS.map((tip) => {
          const { icon: Icon, to } = HINT_DETAILS[tip]
          const copy = t.hints[tip]
          return (
            <li key={tip}>
              <Link to={to} className={cn(LIST_ROW_CLASS, 'items-start')}>
                <Icon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{copy.title}</span>
                  <span className="mt-0.5 block type-footnote text-muted-foreground">
                    {copy.body}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 self-center text-muted-foreground"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </PageShell>
  )
}
