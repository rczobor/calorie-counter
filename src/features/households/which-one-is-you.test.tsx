import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'

const { mutate, toastSuccess } = vi.hoisted(() => ({
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
}))
// The viewer's linked person; null asks the question.
let linkedToMe: string | null = null
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))
vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => (args: unknown) =>
    mutate(
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]),
      args,
    ),
  useQuery: () => linkedToMe,
}))
vi.mock('@/features/cooking/draft-persistence-identity', () => ({
  useDraftPersistenceIdentity: () => ({
    isLoaded: true,
    userId: 'user-1:household-1',
  }),
}))
import { WhichOneIsYou } from './which-one-is-you'

const people = [
  { _id: 'person-alex' as Id<'people'>, name: 'Alex' },
  { _id: 'person-viki' as Id<'people'>, name: 'Viki' },
]
function lastUndo() {
  const options = toastSuccess.mock.lastCall?.[1] as
    { action: { onClick: () => void } } | undefined
  options?.action.onClick()
}
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  linkedToMe = null
  mutate.mockResolvedValue(null)
})
afterEach(cleanup)

describe('WhichOneIsYou', () => {
  it('links the picked person at once, with Undo in the toast', async () => {
    render(<WhichOneIsYou people={people} />)
    fireEvent.click(screen.getByRole('button', { name: 'I’m Viki' }))
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Linked Viki to your account.',
        expect.anything(),
      ),
    )
    expect(mutate).toHaveBeenCalledWith('nutrition:setPersonLinkedToMe', {
      personId: 'person-viki',
      linked: true,
    })
    lastUndo()
    expect(mutate).toHaveBeenLastCalledWith('nutrition:setPersonLinkedToMe', {
      personId: 'person-viki',
      linked: false,
    })
  })

  it('remembers None of these on this device', () => {
    const { unmount } = render(<WhichOneIsYou people={people} />)
    fireEvent.click(screen.getByRole('button', { name: 'None of these' }))
    expect(screen.queryByText('Which one is you?')).toBeNull()
    unmount()
    render(<WhichOneIsYou people={people} />)
    expect(screen.queryByText('Which one is you?')).toBeNull()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('never offers a person another member linked', () => {
    render(
      <WhichOneIsYou
        people={[{ ...people[1], linkedAccount: 'other' as const }]}
      />,
    )
    expect(screen.queryByText('Which one is you?')).toBeNull()
    cleanup()
    render(
      <WhichOneIsYou
        people={[people[0], { ...people[1], linkedAccount: 'other' as const }]}
      />,
    )
    expect(screen.getByRole('button', { name: 'I’m Alex' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'I’m Viki' })).toBeNull()
  })

  it('stays away once the member is linked', () => {
    linkedToMe = 'person-alex'
    render(<WhichOneIsYou people={people} />)
    expect(screen.queryByText('Which one is you?')).toBeNull()
  })
})
