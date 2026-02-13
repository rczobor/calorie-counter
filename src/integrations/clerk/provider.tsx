import { ClerkProvider } from '@clerk/clerk-react'
import { clerkPublishableKey, isClerkConfigured } from './config'

if (!isClerkConfigured) {
  console.warn(
    'Missing VITE_CLERK_PUBLISHABLE_KEY. Clerk auth UI is disabled until it is set.',
  )
}

export default function AppClerkProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isClerkConfigured) {
    return <>{children}</>
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey!} afterSignOutUrl="/">
      {children}
    </ClerkProvider>
  )
}
