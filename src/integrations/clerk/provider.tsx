import { ClerkProvider } from '@clerk/clerk-react'
import { clerkPublishableKey, isClerkConfigured } from './config'

let hasWarnedMissingKey = false

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isClerkConfigured) {
    if (!hasWarnedMissingKey) {
      hasWarnedMissingKey = true
      console.warn(
        'Missing VITE_CLERK_PUBLISHABLE_KEY. Clerk auth UI is disabled until it is set.',
      )
    }
    return <>{children}</>
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey!} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  )
}
