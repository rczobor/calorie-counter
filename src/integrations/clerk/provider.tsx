import { useAuth } from '@clerk/react'
import { InternalClerkProvider as ClerkProvider } from '@clerk/react/internal'
import type { huHU } from '@clerk/localizations/hu-HU'
import { useEffect, useState } from 'react'
import {
  clerkPublishableKey,
  isClerkConfigured,
  sharedClerkUiUrl,
} from './config'
import { DraftPersistenceIdentityProvider } from '@/features/cooking/draft-persistence-identity'
import { useLocale } from '@/i18n/locale'
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

  return <ConfiguredClerkProvider>{children}</ConfiguredClerkProvider>
}

// Clerk is English by default; the Hungarian text loads only for Hungarian users.
function useClerkLocalization() {
  const locale = useLocale()
  const [hungarian, setHungarian] = useState<typeof huHU>()
  useEffect(() => {
    if (locale !== 'hu' || hungarian) return
    let current = true
    void import('@clerk/localizations/hu-HU').then(({ huHU }) => {
      if (current) setHungarian(huHU)
    })
    return () => {
      current = false
    }
  }, [locale, hungarian])
  return locale === 'hu' ? hungarian : undefined
}

function ConfiguredClerkProvider({ children }: { children: React.ReactNode }) {
  const localization = useClerkLocalization()
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey!}
      afterSignOutUrl="/"
      __internal_clerkUIUrl={sharedClerkUiUrl}
      localization={localization}
    >
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
