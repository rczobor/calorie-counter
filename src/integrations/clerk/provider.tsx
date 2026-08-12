import { ClerkProvider, useAuth } from '@clerk/react'
import { clerkPublishableKey, isClerkConfigured } from './config'
import { DraftPersistenceIdentityProvider } from '@/features/cooking/draft-persistence-identity'
import { isE2eMockMode } from '@/testing/e2e/config'

if (!isClerkConfigured && !isE2eMockMode) {
  console.warn(
    'Missing VITE_CLERK_PUBLISHABLE_KEY. Clerk auth UI is disabled until it is set.',
  )
}

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (isE2eMockMode) {
    return (
      <DraftPersistenceIdentityProvider
        value={{ isLoaded: true, userId: 'e2e-user' }}
      >
        {children}
      </DraftPersistenceIdentityProvider>
    )
  }

  if (!isClerkConfigured) {
    return (
      <DraftPersistenceIdentityProvider
        value={{ isLoaded: false, userId: null }}
      >
        {children}
      </DraftPersistenceIdentityProvider>
    )
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey!} afterSignOutUrl="/">
      <ClerkDraftPersistenceIdentity>{children}</ClerkDraftPersistenceIdentity>
    </ClerkProvider>
  )
}

function ClerkDraftPersistenceIdentity({
  children,
}: {
  children: React.ReactNode
}) {
  const { isLoaded, userId } = useAuth()
  return (
    <DraftPersistenceIdentityProvider
      value={{ isLoaded, userId: userId ?? null }}
    >
      {children}
    </DraftPersistenceIdentityProvider>
  )
}
