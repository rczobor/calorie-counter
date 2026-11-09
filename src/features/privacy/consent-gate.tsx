import { SignOutButton } from '@clerk/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState, type ReactNode } from 'react'
import { api } from '../../../convex/_generated/api'
import { PRIVACY_NOTICE_VERSION } from '../../../convex/lib/privacy'
import { PagePlaceholder } from '@/components/page/page-placeholder'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { toErrorMessage } from '@/lib/nutrition'
import { isE2eMockMode } from '@/testing/e2e/config'
import { DeleteAccount } from './delete-account'
import { messages } from './consent-gate.messages'

/**
 * Holds the signed-in app until the account consents to the current privacy
 * notice. The server enforces the same rule, so this only decides what to show.
 */
export function ConsentGate({ children }: { children: ReactNode }) {
  const t = useMessages(messages)
  const consent = useQuery(api.privacy.consent, {})
  // Start the household list now so the gate costs no extra round trip;
  // HouseholdProvider reuses this subscription.
  useQuery(api.households.list, {})
  if (consent === undefined) return <PagePlaceholder label={t.checking} />
  return consent.accepted ? children : <ConsentScreen />
}

function ConsentScreen() {
  const t = useMessages(messages)
  const locale = useLocale()
  const accept = useMutation(api.privacy.accept)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function agree() {
    setPending(true)
    setError('')
    try {
      await accept({ version: PRIVACY_NOTICE_VERSION })
    } catch (failure) {
      setError(toErrorMessage(failure, locale))
      setPending(false)
    }
  }

  return (
    <main className="flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-6 sm:px-6 md:pt-10">
      <section
        aria-labelledby="consent-title"
        className="mx-auto max-w-xl space-y-5"
      >
        <h1 id="consent-title" className="type-large-title">
          {t.title}
        </h1>
        <p className="type-body">{t.body}</p>
        <ul className="inset-group inset-rows">
          {t.points.map((point) => (
            <li key={point} className="px-4 py-3 type-subhead">
              {point}
            </li>
          ))}
        </ul>
        <Link
          to="/privacy"
          className="inline-flex min-h-11 items-center type-body font-medium text-primary underline underline-offset-2"
        >
          {t.readNotice}
        </Link>
        <p className="type-subhead text-muted-foreground">{t.statement}</p>
        {error ? (
          <p role="alert" className="type-subhead text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" disabled={pending} onClick={() => void agree()}>
            {pending ? t.saving : t.agree}
          </Button>
          {isClerkConfigured && !isE2eMockMode ? (
            <SignOutButton>
              <Button size="lg" variant="outline">
                {t.signOut}
              </Button>
            </SignOutButton>
          ) : null}
        </div>
        <DeleteAccount variant="link" />
      </section>
    </main>
  )
}
