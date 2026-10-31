import { createContext, useContext, useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  DraftPersistenceIdentityProvider,
  useDraftPersistenceIdentity,
} from '../cooking/draft-persistence-identity'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { toErrorMessage } from '@/lib/nutrition'
import { HouseholdInvitation } from './household-invitation'

export type HouseholdContextValue = {
  householdId?: Id<'households'>
  selectHousehold?: (id: Id<'households'>) => void
}
const HouseholdContext = createContext<HouseholdContextValue>({})
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

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const identity = useDraftPersistenceIdentity()
  return (
    <HouseholdSession
      key={identity.userId ?? 'loading'}
      userId={identity.userId}
    >
      {children}
    </HouseholdSession>
  )
}

function HouseholdSession({
  children,
  userId,
}: {
  children: React.ReactNode
  userId: string | null
}) {
  const storageKey = `calorie-counter:household:${userId}`
  const [selected, setSelected] = useState(() => {
    if (typeof window === 'undefined') return null
    const linked = new URLSearchParams(window.location.search).get(
      'householdId',
    )
    return linked ?? readSelection(storageKey)
  })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const ensurePersonal = useMutation(api.households.ensurePersonal)
  const households = useQuery(api.households.list, {})
  useEffect(() => {
    let current = true
    void ensurePersonal({})
      .then((personalHouseholdId) => {
        if (current) {
          setSelected((previous) => previous ?? personalHouseholdId)
          setReady(true)
        }
      })
      .catch((error) => {
        if (current) setError(toErrorMessage(error))
      })
    return () => {
      current = false
    }
  }, [ensurePersonal])

  const household = households?.find((row) => row._id === selected)
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

  if (error)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6" role="alert">
        <p>{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    )
  if (!ready || households === undefined)
    return (
      <p className="p-6" role="status">
        Preparing your household…
      </p>
    )
  if (!household)
    return (
      <div className="mx-auto max-w-xl space-y-3 p-6">
        {households.length === 0 ? (
          <p>
            You no longer belong to any households. Ask a household admin for an
            invitation link to join again.
          </p>
        ) : (
          <>
            <p>
              Your selected household is no longer available. Choose a household
              to continue.
            </p>
            <Select
              ariaLabel="Household"
              options={households.map((row) => ({
                value: row._id,
                label: row.name,
              }))}
              onValueChange={(id) => {
                if (id) selectHousehold(id)
              }}
            />
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
        {children}
      </DraftPersistenceIdentityProvider>
    </HouseholdContext.Provider>
  )
}
