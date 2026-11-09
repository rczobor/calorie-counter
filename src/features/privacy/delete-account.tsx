import { useClerk, useReverification } from '@clerk/react'
import { useMutation } from 'convex/react'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ConfirmDestructiveDialog } from '@/components/page/confirm-destructive-dialog'
import { LIST_ROW_CLASS } from '@/components/page/list-row'
import { useLocale } from '@/i18n/locale'
import { useMessages } from '@/i18n/messages'
import { isClerkConfigured } from '@/integrations/clerk/config'
import { toErrorMessage } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import { isE2eMockMode } from '@/testing/e2e/config'
import { PRIVACY_CONTACT } from './privacy-notice'
import { messages } from './delete-account.messages'

/** Deletes the Clerk sign-in after the app data is gone; rejects if it stays. */
function useClerkSignInRemoval() {
  const clerk = useClerk()
  // Clerk asks an older session to verify again before deleting a user.
  const deleteUser = useReverification(async () => {
    if (!clerk.user) throw new Error('No signed-in user.')
    await clerk.user.delete()
  })
  return async () => {
    let removed = true
    try {
      await deleteUser()
    } catch {
      removed = false
    }
    await clerk.signOut().catch(() => undefined)
    if (!removed) throw new Error('The sign-in was not removed.')
  }
}

// Without Clerk (browser smoke tests, unconfigured setups) there is no sign-in
// to remove. The choice is fixed per build, so hook order never changes.
const useSignInRemoval =
  isE2eMockMode || !isClerkConfigured
    ? () => async () => undefined
    : useClerkSignInRemoval

/**
 * The Settings row (or a quieter text button on the consent screen) that
 * deletes the account. The app data goes first: once the sign-in is gone the
 * server could no longer tell whose data to delete.
 */
export function DeleteAccount({
  variant = 'row',
}: {
  variant?: 'row' | 'link'
}) {
  const t = useMessages(messages)
  const locale = useLocale()
  const deleteAccount = useMutation(api.account.deleteMyAccount)
  const removeSignIn = useSignInRemoval()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function confirm() {
    setPending(true)
    try {
      await deleteAccount({})
    } catch (error) {
      toast.error(toErrorMessage(error, locale))
      setPending(false)
      return
    }
    setOpen(false)
    try {
      await removeSignIn()
      toast.success(t.deleted)
    } catch {
      toast.error(t.signInKept(PRIVACY_CONTACT.email), { duration: Infinity })
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          variant === 'row'
            ? cn(LIST_ROW_CLASS, 'w-full text-left text-destructive')
            : // A destructive text action carries its icon and colour.
              'inline-flex min-h-11 items-center gap-1.5 type-subhead font-medium text-destructive',
        )}
        onClick={() => setOpen(true)}
      >
        {variant === 'link' ? (
          <Trash2 className="size-4" aria-hidden="true" />
        ) : null}
        {t.action}
      </button>
      <ConfirmDestructiveDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={() => void confirm()}
        title={t.title}
        description={
          <>
            <span className="block font-medium text-foreground">
              {t.description.lead}
            </span>{' '}
            <span className="mt-2 block">{t.description.solo}</span>{' '}
            <span className="mt-2 block">{t.description.shared}</span>{' '}
            <span className="mt-2 block">{t.description.identity}</span>{' '}
            {/* The warning ends the dialog, on its own line, in foreground. */}
            <span className="mt-2 block font-medium text-foreground">
              {t.description.warning}
            </span>
          </>
        }
        confirmLabel={pending ? t.deleting : t.action}
        disabled={pending}
      />
    </>
  )
}
