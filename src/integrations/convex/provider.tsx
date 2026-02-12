import { ConvexProvider } from 'convex/react'
import { ConvexQueryClient } from '@convex-dev/react-query'
import { convexUrl, isConvexConfigured } from './config'

let convexQueryClient: ConvexQueryClient | null = null
let hasWarnedMissingUrl = false

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
    if (!hasWarnedMissingUrl) {
      hasWarnedMissingUrl = true
      console.warn(
        'Missing VITE_CONVEX_URL. Convex hooks are disabled until it is set.',
      )
    }
    return <>{children}</>
  }

  const client = getConvexClient()
  if (!client) {
    return <>{children}</>
  }

  return (
    <ConvexProvider client={client.convexClient}>{children}</ConvexProvider>
  )
}
