import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useAuth } from '@clerk/clerk-react'
import { convexUrl, isConvexConfigured } from './config'
import { isClerkConfigured } from '../clerk/config'

let convexClient: ConvexReactClient | null = null

if (!isConvexConfigured) {
  console.warn(
    'Missing VITE_CONVEX_URL. Convex hooks are disabled until it is set.',
  )
}

function getConvexClient() {
  if (!convexClient && convexUrl) {
    convexClient = new ConvexReactClient(convexUrl)
  }
  return convexClient
}

export default function AppConvexProvider({
  children,
}: {
  children: React.ReactNode
}) {
  if (!isConvexConfigured) {
    return <>{children}</>
  }

  const client = getConvexClient()
  if (!client) {
    return <>{children}</>
  }

  if (isClerkConfigured) {
    return (
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    )
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>
}
