// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteAccount } from './delete-account'

const { deleteAccount, removeUser, signOut, toast, clerk } = vi.hoisted(() => {
  const removeUser = vi.fn()
  return {
    deleteAccount: vi.fn(),
    removeUser,
    signOut: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
    clerk: {
      user: { delete: removeUser } as { delete: typeof removeUser } | null,
    },
  }
})
vi.mock('convex/react', () => ({ useMutation: () => deleteAccount }))
vi.mock('@/integrations/clerk/config', () => ({ isClerkConfigured: true }))
vi.mock('@clerk/react', () => ({
  useClerk: () => ({ user: clerk.user, signOut }),
  // Reverification only adds a prompt when Clerk asks for one.
  useReverification: (fetcher: () => Promise<void>) => fetcher,
}))
vi.mock('sonner', () => ({ toast }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  clerk.user = { delete: removeUser }
})

async function confirmDeletion() {
  render(<DeleteAccount />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(dialog.textContent).toContain('Households you share keep their data')
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!,
  )
}

describe('account deletion', () => {
  it('deletes the app data, then the sign-in', async () => {
    deleteAccount.mockResolvedValue(null)
    removeUser.mockResolvedValue(undefined)
    signOut.mockResolvedValue(undefined)
    await confirmDeletion()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Your account was deleted.'),
    )
    expect(deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
      removeUser.mock.invocationCallOrder[0],
    )
    expect(signOut).toHaveBeenCalled()
  })

  it('signs out and says how to remove a sign-in that could not be deleted', async () => {
    deleteAccount.mockResolvedValue(null)
    removeUser.mockRejectedValue(new Error('Reverification required'))
    signOut.mockResolvedValue(undefined)
    await confirmDeletion()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('czobor94@gmail.com'),
        { duration: Infinity },
      ),
    )
    expect(signOut).toHaveBeenCalled()
  })

  it('does not claim success when there was no Clerk user to delete', async () => {
    deleteAccount.mockResolvedValue(null)
    signOut.mockResolvedValue(undefined)
    clerk.user = null
    await confirmDeletion()
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps the sign-in when the data could not be deleted', async () => {
    deleteAccount.mockRejectedValue(new Error('Offline'))
    await confirmDeletion()
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(removeUser).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
  })
})
