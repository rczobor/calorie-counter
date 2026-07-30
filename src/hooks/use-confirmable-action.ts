import { useCallback, useRef, useState } from 'react'
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
  const [isRunning, setIsRunning] = useState(false)
  const isRunningRef = useRef(false)

  const runAction = useCallback(
    async (successText: string, action: () => Promise<unknown>) => {
      if (isRunningRef.current) {
        return false
      }
      isRunningRef.current = true
      setIsRunning(true)
      try {
        await action()
        toast.success(successText)
        return true
      } catch (error) {
        toast.error(toErrorMessage(error))
        return false
      } finally {
        isRunningRef.current = false
        setIsRunning(false)
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
    isRunning,
    runAction,
    confirmAndRunAction,
    handleConfirmDialogOpenChange,
    confirmPendingAction,
  }
}
