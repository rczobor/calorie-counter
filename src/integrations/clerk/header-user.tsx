import { Show, UserButton } from '@clerk/react'
import { isClerkConfigured } from './config'
import { isE2eMockMode } from '@/testing/e2e/config'

export default function HeaderUser() {
  if (isE2eMockMode) {
    return <p className="text-xs text-muted-foreground">Mock test session</p>
  }

  if (!isClerkConfigured) {
    return (
      <p className="text-xs text-muted-foreground">
        Add `VITE_CLERK_PUBLISHABLE_KEY` to enable auth.
      </p>
    )
  }

  return (
    <Show when="signed-in">
      <UserButton />
    </Show>
  )
}
