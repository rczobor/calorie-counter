import { Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useMessages } from '@/i18n/messages'
import { messages } from './confirm-destructive-dialog.messages'

type ConfirmDestructiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  description?: string
  title?: string
  confirmLabel?: string
  disabled?: boolean
}

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  onConfirm,
  description,
  title,
  confirmLabel,
  disabled = false,
}: ConfirmDestructiveDialogProps) {
  const t = useMessages(messages)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? t.title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            className="gap-2"
            variant="destructive"
            disabled={disabled}
            onClick={onConfirm}
          >
            <Trash2 className="h-4 w-4" />
            {confirmLabel ?? t.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
