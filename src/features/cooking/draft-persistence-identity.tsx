import { createContext, useContext } from 'react'

export type DraftPersistenceIdentity = {
  isLoaded: boolean
  userId: string | null
}

const DraftPersistenceIdentityContext = createContext<DraftPersistenceIdentity>(
  {
    isLoaded: false,
    userId: null,
  },
)

export function DraftPersistenceIdentityProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: DraftPersistenceIdentity
}) {
  return (
    <DraftPersistenceIdentityContext.Provider value={value}>
      {children}
    </DraftPersistenceIdentityContext.Provider>
  )
}

export function useDraftPersistenceIdentity() {
  return useContext(DraftPersistenceIdentityContext)
}
