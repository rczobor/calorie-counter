import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexProvider } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useAuth } from '@clerk/clerk-react'
import { convexUrl, isConvexConfigured } from './config'
import { isClerkConfigured } from '../clerk/config'

let convexQueryClient: ConvexQueryClient | null = null

if (!isConvexConfigured) {
  console.warn(
    'Missing VITE_CONVEX_URL. Convex hooks are disabled until it is set.',
  )
}

function getConvexClient() {
  if (!convexQueryClient && convexUrl) {
    convexQueryClient = new ConvexQueryClient(convexUrl)
  }
  return convexQueryClient
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
      <ConvexProviderWithClerk client={client.convexClient} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    )
  }

  return (
    <ConvexProvider client={client.convexClient}>{children}</ConvexProvider>
  )
}
