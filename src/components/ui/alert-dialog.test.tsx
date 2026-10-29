// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

afterEach(cleanup)

it('lets the caller close after confirming while cancel still requests dismissal', () => {
  const onConfirm = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete food?</AlertDialogTitle>
        <AlertDialogDescription>
          This action is permanent.
        </AlertDialogDescription>
        <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
      </AlertDialogContent>
    </AlertDialog>,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(screen.getByRole('alertdialog')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
})
