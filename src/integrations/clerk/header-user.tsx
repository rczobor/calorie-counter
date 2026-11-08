import { Show, UserButton } from '@clerk/react'
import { isClerkConfigured } from './config'
import { isE2eMockMode } from '@/testing/e2e/config'

/** The account control: an avatar in the desktop bar, or avatar and name in
 * the phone Settings list (`row`). */
export default function HeaderUser({ row = false }: { row?: boolean }) {
  if (isE2eMockMode) {
    return (
      <p
        className={
          row
            ? 'text-base text-muted-foreground'
            : 'text-xs text-muted-foreground'
        }
      >
        Mock test session
      </p>
    )
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
      <UserButton showName={row} />
    </Show>
  )
}
