import { SignOutButton } from '@clerk/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { ChartNoAxesColumn, ChevronRight, Trash2, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api } from '../../../convex/_generated/api'
import { PRIVACY_NOTICE_VERSION } from '../../../convex/lib/privacy'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
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

const POINTS = [
  { key: 'who', Icon: Users },
  { key: 'statistics', Icon: ChartNoAxesColumn },
  { key: 'delete', Icon: Trash2 },
] as const

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
      <section aria-labelledby="consent-title" className="mx-auto max-w-xl">
        <h1 id="consent-title" className="type-large-title">
          {t.title}
        </h1>
        <p className="mt-3 type-body">{t.body}</p>
        {/* Hairlines start at the text, past the leading icons. */}
        <ul className="mt-6 inset-group inset-rows [--row-inset:3rem]">
          {POINTS.map(({ key, Icon }) => (
            <li key={key} className="flex items-start gap-3 px-4 py-3">
              <Icon
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="type-subhead">{t.points[key]}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 inset-group">
          <Link to="/privacy" className={LIST_ROW_CLASS}>
            <span className="min-w-0 flex-1">{t.readNotice}</span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        </div>
        <p className="mt-8 type-body">{t.statement}</p>
        {error ? (
          <p role="alert" className="mt-3 type-subhead text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => void agree()}
          >
            {pending ? t.saving : t.agree}
          </Button>
          {isClerkConfigured && !isE2eMockMode ? (
            <SignOutButton>
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                {t.signOut}
              </Button>
            </SignOutButton>
          ) : null}
        </div>
        <p className="mt-8 type-footnote text-muted-foreground">{t.decline}</p>
        <DeleteAccount variant="link" />
      </section>
    </main>
  )
}
