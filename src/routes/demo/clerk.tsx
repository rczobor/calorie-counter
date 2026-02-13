import { createFileRoute } from '@tanstack/react-router'
import { useUser } from '@clerk/clerk-react'
import { isClerkConfigured } from '@/integrations/clerk/config'

export const Route = createFileRoute('/demo/clerk')({
  component: App,
})

function App() {
  if (!isClerkConfigured) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Add `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` to enable this demo.
      </div>
    )
  }

  return <ConfiguredClerkDemo />
}

function ConfiguredClerkDemo() {
  const { isSignedIn, user, isLoaded } = useUser()

  if (!isLoaded) {
    return <div className="p-4">Loading...</div>
  }

  if (!isSignedIn) {
    return <div className="p-4">Sign in to view this page</div>
  }

  return <div className="p-4">Hello {user.firstName}!</div>
}
