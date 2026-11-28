import { useEffect } from 'react'
import { toast } from 'sonner'

import { useMessages } from '@/i18n/messages'
import type { AppUpdate } from './register'
import { messages } from './update-notice.messages'

// One toast, updated in place when the offer repeats or the language changes.
const TOAST_ID = 'app-update'

/** Offers a downloaded build until the person refreshes or dismisses it. */
export function UpdateNotice({ update }: { update: AppUpdate | null }) {
  const t = useMessages(messages)
  useEffect(() => {
    if (!update) return
    toast(t.ready, {
      id: TOAST_ID,
      duration: Infinity,
      closeButton: true,
      action: {
        label: t.refresh,
        onClick: (event) => {
          if (!update.wouldLoseWork()) {
            update.apply()
            return
          }
          // Keep the toast open and turn it into the warning.
          event.preventDefault()
          toast.warning(t.unsaved, {
            id: TOAST_ID,
            duration: Infinity,
            closeButton: true,
            action: { label: t.refreshAnyway, onClick: update.apply },
          })
        },
      },
    })
  }, [update, t])
  return null
}
