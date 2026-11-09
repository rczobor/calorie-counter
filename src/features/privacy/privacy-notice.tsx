import type { ReactNode } from 'react'
import { PRIVACY_NOTICE_VERSION } from '../../../convex/lib/privacy'
import { PageShell } from '@/components/page/page-shell'
import { SettingsBreadcrumbs } from '@/components/page/settings-breadcrumbs'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { formatDate } from '@/lib/dates'
import { messages } from './privacy-notice.messages'

/** The data controller the notice names. */
export const PRIVACY_CONTACT = {
  name: 'Robi Czobor',
  email: 'czobor94@gmail.com',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="type-headline">{title}</h2>
      {children}
    </section>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

/** Readable before sign-in: the root route renders it outside the auth gate. */
export function PrivacyNotice() {
  const t = useMessages(messages)
  const locale = useLocale()
  const email = (
    <a
      className="font-medium text-primary underline underline-offset-2"
      href={`mailto:${PRIVACY_CONTACT.email}`}
    >
      {PRIVACY_CONTACT.email}
    </a>
  )
  return (
    <PageShell
      title={t.title}
      subtitle={t.updated(
        formatDate(PRIVACY_NOTICE_VERSION, locale, { year: 'always' }),
      )}
      breadcrumbs={<SettingsBreadcrumbs current={t.title} />}
      contentClassName="max-w-3xl"
    >
      <div className="mt-6 space-y-8 type-body text-foreground [&_p]:text-pretty">
        <p>{t.intro}</p>
        <Section title={t.controllerHeading}>
          <p>{t.controller(PRIVACY_CONTACT.name, email)}</p>
        </Section>
        <Section title={t.storesHeading}>
          <List items={t.stores} />
        </Section>
        <Section title={t.healthHeading}>
          <p>{t.health}</p>
        </Section>
        <Section title={t.whyHeading}>
          <List items={t.why} />
          <p className="type-subhead text-muted-foreground">{t.basis}</p>
        </Section>
        <Section title={t.whoHeading}>
          <List items={t.who} />
        </Section>
        <Section title={t.keepHeading}>
          <p>{t.keep}</p>
          <p>{t.shared}</p>
        </Section>
        <Section title={t.rightsHeading}>
          <p>{t.rights(email)}</p>
        </Section>
        <Section title={t.medicalHeading}>
          <p>{t.medical}</p>
          <p>{t.asIs}</p>
        </Section>
        <Section title={t.changesHeading}>
          <p>{t.changes}</p>
        </Section>
      </div>
    </PageShell>
  )
}
