import { Show, SignInButton, UserButton } from '@clerk/react'
import { Button } from '@/components/ui/button'
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
    <>
      <Show when="signed-in">
        <UserButton />
      </Show>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <Button size="sm" className="w-full sm:w-auto">
            Sign in
          </Button>
        </SignInButton>
      </Show>
    </>
  )
}
