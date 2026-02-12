import {
  SignedIn,
  SignInButton,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { isClerkConfigured } from './config'

export default function HeaderUser() {
  if (!isClerkConfigured) {
    return (
      <p className="text-xs text-muted-foreground">
        Add `VITE_CLERK_PUBLISHABLE_KEY` to enable auth.
      </p>
    )
  }

  return (
    <>
      <SignedIn>
        <UserButton />
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="sm" className="w-full sm:w-auto">
            Sign in
          </Button>
        </SignInButton>
      </SignedOut>
    </>
  )
}
