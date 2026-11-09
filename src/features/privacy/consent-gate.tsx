import { SignOutButton } from '@clerk/react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import {
  ChartNoAxesColumn,
  ChevronRight,
  FileText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { api } from '../../../convex/_generated/api'
import { PRIVACY_NOTICE_VERSION } from '../../../convex/lib/privacy'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { PagePlaceholder } from '@/components/page/page-placeholder'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { formatDate } from '@/lib/dates'
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
  // A promise never borrows the destructive action's trash glyph.
  { key: 'delete', Icon: ShieldCheck },
] as const

function keyPhrase(text: string) {
  return <strong className="font-semibold">{text}</strong>
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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-6 sm:px-6 md:pt-10">
      {/* Settings' page column, so the left edge meets the top bar; the text
          keeps a reading measure inside it. */}
      <section aria-labelledby="consent-title" className="max-w-xl">
        <h1 id="consent-title" className="type-large-title">
          {t.title}
        </h1>
        <p className="mt-4 type-body text-pretty">{t.body}</p>
        <h2 id="consent-points" className="mt-6 group-label">
          {t.pointsTitle}
        </h2>
        {/* Hairlines start at the text, past the leading icons. */}
        <ul
          aria-labelledby="consent-points"
          className="inset-group inset-rows [--row-inset:3rem]"
        >
          {POINTS.map(({ key, Icon }) => (
            <li key={key} className="flex items-start gap-3 px-4 py-3">
              <Icon
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="type-subhead text-pretty">
                {t.points[key](keyPhrase)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 inset-group">
          <Link to="/privacy" className={LIST_ROW_CLASS}>
            {/* Its text shares the promises' left edge. */}
            <FileText
              className="size-5 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="block">{t.readNotice}</span>{' '}
              {/* Why someone who already agreed is asked again. */}
              <span className="block type-footnote text-muted-foreground">
                {t.noticeUpdated(formatDate(PRIVACY_NOTICE_VERSION, locale))}
              </span>
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        </div>
        {/* On phones the decision is pinned just above the floating tab bar,
            a translucent toolbar the promises scroll under, so it stays in
            reach in any language. Desktop keeps it inline. */}
        <div className="sticky bottom-[calc(3.25rem+max(0.75rem,env(safe-area-inset-bottom)-0.5rem))] z-10 -mx-4 mt-6 bg-background/85 px-4 pt-4 pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:p-0 md:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:bg-background">
          {/* Balanced wrapping only on desktop; phones keep the body's measure. */}
          <p className="type-body md:text-pretty">{t.statement}</p>
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
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {t.signOut}
                </Button>
              </SignOutButton>
            ) : null}
          </div>
          {/* Declining is one honest line: the question, then the action. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 md:mt-4">
            <p className="type-subhead text-muted-foreground">{t.decline}</p>
            <DeleteAccount variant="link" />
          </div>
        </div>
      </section>
    </main>
  )
}
