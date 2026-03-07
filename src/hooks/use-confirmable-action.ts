import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { toErrorMessage } from '@/lib/nutrition'

export type PendingConfirmation = {
  message: string
  successText: string
  action: () => Promise<unknown>
}

export function useConfirmableAction() {
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)

  const runAction = useCallback(
    async (successText: string, action: () => Promise<unknown>) => {
      try {
        await action()
        toast.success(successText)
      } catch (error) {
        toast.error(toErrorMessage(error))
      }
    },
    [],
  )

  const confirmAndRunAction = useCallback(
    (message: string, successText: string, action: () => Promise<unknown>) => {
      setPendingConfirmation({ message, successText, action })
      setIsConfirmDialogOpen(true)
    },
    [],
  )

  const handleConfirmDialogOpenChange = useCallback((open: boolean) => {
    setIsConfirmDialogOpen(open)
    if (!open) {
      setPendingConfirmation(null)
    }
  }, [])

  const confirmPendingAction = useCallback(() => {
    if (!pendingConfirmation) {
      return
    }

    const { successText, action } = pendingConfirmation
    setIsConfirmDialogOpen(false)
    setPendingConfirmation(null)
    void runAction(successText, action)
  }, [pendingConfirmation, runAction])

  return {
    pendingConfirmation,
    isConfirmDialogOpen,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  }
}
