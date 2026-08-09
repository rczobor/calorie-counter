import { ClerkProvider } from '@clerk/react'
import { clerkPublishableKey, isClerkConfigured } from './config'
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
  if (isE2eMockMode || !isClerkConfigured) {
    return <>{children}</>
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey!} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  )
}
