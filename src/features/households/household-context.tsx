import { LoadingRows } from '@/components/page/loading-content'
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  DraftPersistenceIdentityProvider,
  useDraftPersistenceIdentity,
} from '../cooking/draft-persistence-identity'
import { Button } from '@/components/ui/button'
import { toErrorMessage } from '@/lib/nutrition'
import { HouseholdInvitation } from './household-invitation'
import { markStartup } from '@/lib/startup-timing'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { messages } from './household-context.messages'

const Select = lazy(async () => ({
  default: (await import('@/components/ui/select')).Select,
}))

export type HouseholdContextValue = {
  householdId?: Id<'households'>
  selectHousehold?: (id: Id<'households'>) => void
}
const HouseholdContext = createContext<HouseholdContextValue>({})
const subscribeNoop = () => () => {}
export function useHousehold() {
  return useContext(HouseholdContext)
}

function readSelection(key: string) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function HouseholdProvider({
  children,
  accountPage = false,
}: {
  children: React.ReactNode
  accountPage?: boolean
}) {
  const identity = useDraftPersistenceIdentity()
  return (
    <HouseholdSession
      key={identity.userId ?? 'loading'}
      userId={identity.userId}
      accountPage={accountPage}
    >
      {children}
    </HouseholdSession>
  )
}

function HouseholdSession({
  children,
  userId,
  accountPage,
}: {
  children: React.ReactNode
  userId: string | null
  accountPage: boolean
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const storageKey = `calorie-counter:household:${userId}`
  const [selected, setSelected] = useState(() => {
    if (typeof window === 'undefined') return null
    const linked = new URLSearchParams(window.location.search).get(
      'householdId',
    )
    return linked ?? readSelection(storageKey)
  })
  const [ready, setReady] = useState(false)
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
  // Keeps the thrown value so the fallback text follows a language switch.
  const [failure, setFailure] = useState<{ error: unknown }>()
  const error = failure ? toErrorMessage(failure.error, locale) : ''
  const ensurePersonal = useMutation(api.households.ensurePersonal)
  const households = useQuery(api.households.list, {})
  const householdsLoaded = households !== undefined
  useEffect(() => {
    if (!householdsLoaded) return
    let current = true
    void ensurePersonal({})
      .then((personalHouseholdId) => {
        if (current) {
          setSelected((previous) => previous ?? personalHouseholdId)
          setReady(true)
        }
      })
      .catch((error) => {
        if (current) setFailure({ error })
      })
    return () => {
      current = false
    }
  }, [ensurePersonal, householdsLoaded])

  const household = households?.find((row) => row._id === selected)
  useEffect(() => {
    if (household) markStartup('household')
  }, [household])
  function selectHousehold(id: Id<'households'>) {
    try {
      window.localStorage.setItem(storageKey, id)
    } catch {
      /* Selection still works without storage. */
    }
    setSelected(id)
    // Deep-link context is consumed once; future switches must not revive it on refresh.
    const url = new URL(window.location.href)
    for (const key of ['householdId', 'personId', 'sessionId'])
      url.searchParams.delete(key)
    window.history.replaceState(null, '', url)
  }
  useEffect(() => {
    if (household) {
      try {
        window.localStorage.setItem(storageKey, household._id)
      } catch {
        /* Storage may be unavailable. */
      }
    }
  }, [household, storageKey])

  if (error && !household)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6" role="alert">
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>{t.retry}</Button>
      </div>
    )
  // A saved selection is usable once current membership is verified. The
  // personal-household bootstrap can finish without delaying returning users.
  if ((!ready && (!hydrated || !household)) || households === undefined)
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <LoadingRows label={t.preparing} />
      </div>
    )
  if (!household && accountPage) return <>{children}</>
  if (!household)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6">
        {households.length === 0 ? (
          <p>{t.noHouseholds}</p>
        ) : (
          <>
            <p>{t.selectionUnavailable}</p>
            <Suspense
              fallback={<LoadingRows label={t.loadingChoices} rows={1} />}
            >
              <Select
                ariaLabel={t.household}
                options={households.map((row) => ({
                  value: row._id,
                  label: row.name,
                }))}
                onValueChange={(id) => {
                  const choice = households.find((row) => row._id === id)
                  if (choice) selectHousehold(choice._id)
                }}
              />
            </Suspense>
          </>
        )}
        <HouseholdInvitation onJoined={selectHousehold} />
      </div>
    )
  return (
    <HouseholdContext.Provider
      value={{ householdId: household._id, selectHousehold }}
    >
      <DraftPersistenceIdentityProvider
        key={household._id}
        value={{
          isLoaded: true,
          userId: userId ? `${userId}:${household._id}` : null,
        }}
      >
        {error ? (
          <p
            role="alert"
            className="mx-auto w-full max-w-3xl px-6 py-3 text-sm"
          >
            {t.setupFailed(error)}
          </p>
        ) : null}
        {children}
      </DraftPersistenceIdentityProvider>
    </HouseholdContext.Provider>
  )
}
