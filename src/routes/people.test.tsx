import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Id } from '../../convex/_generated/dataModel'

const { mutate, confirm } = vi.hoisted(() => ({
  mutate: vi.fn(),
  confirm: vi.fn(),
}))
const alex = {
  _id: 'person-alex' as Id<'people'>,
  _creationTime: 1,
  name: 'Alex',
  currentDailyGoalKcal: 2000.5,
  archived: false,
  editRevision: 4,
  createdAt: 1,
}
const sam = {
  ...alex,
  _id: 'person-sam' as Id<'people'>,
  name: 'Sam',
  archived: true,
}
let pending = false
let activeStatus: 'Exhausted' | 'CanLoadMore' = 'Exhausted'
const loadMore = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))
vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    isRunning: pending,
    isConfirmDialogOpen: false,
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
    confirmAndRunAction: confirm,
    runAction: async (_label: string, action: () => Promise<unknown>) =>
      action(),
  }),
}))
vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => (args: unknown) =>
    mutate(
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]),
      args,
    ),
  useQuery: (_reference: unknown, args: unknown) =>
    args === 'skip' ? undefined : alex,
  usePaginatedQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: { archived?: boolean } | 'skip',
  ) => {
    if (args === 'skip') return { results: [], status: 'Exhausted', loadMore }
    if (getFunctionName(reference) === 'people:listGoalHistory')
      return {
        results: [
          {
            _id: 'goal-1',
            effectiveDate: '2026-10-01',
            goalKcal: 2000.5,
            reason: 'Initial goal',
          },
        ],
        status: 'Exhausted',
        loadMore,
      }
    return {
      results: args.archived ? [sam] : [alex],
      status: activeStatus,
      loadMore,
    }
  },
}))
import { Route } from './people'
function show() {
  const Component = Route.options.component as ComponentType
  return render(<Component />)
}
function openAlex() {
  fireEvent.click(screen.getByRole('button', { name: /^Edit Alex/ }))
}
beforeEach(() => {
  vi.clearAllMocks()
  pending = false
  activeStatus = 'Exhausted'
  mutate.mockResolvedValue(null)
  confirm.mockImplementation(
    (_message: string, _label: string, action: () => Promise<unknown>) =>
      action(),
  )
})
afterEach(cleanup)

describe('People settings', () => {
  it('starts with a person list and opens goal history without a creation form', async () => {
    show()
    expect(screen.queryByLabelText('Person name')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Edit Alex 2001 kcal / day' }),
    ).toBeTruthy()
    expect(screen.queryByText('Consumed')).toBeNull()
    expect(screen.queryByText('Archived')).toBeNull()
    openAlex()
    expect(await screen.findByText('Initial goal')).toBeTruthy()
  })
  it('opens creation explicitly and preserves fractional goals on a name-only edit', async () => {
    show()
    openAlex()
    expect(
      (screen.getByLabelText('Daily calorie goal') as HTMLInputElement).value,
    ).toBe('2000.5')
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Alex updated' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        'nutrition:updatePerson',
        expect.objectContaining({
          personId: alex._id,
          expectedEditRevision: 4,
          name: 'Alex updated',
          goalKcal: 2000.5,
        }),
      ),
    )
    expect(screen.queryByLabelText('Person name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New person' }))
    expect(screen.queryByLabelText('Goal change reason')).toBeNull()
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'New person' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create person' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        'nutrition:createPerson',
        expect.objectContaining({
          name: 'New person',
          currentDailyGoalKcal: 2200,
        }),
      ),
    )
  })
  it('requires confirmation before discarding unsaved edits', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New person' }))
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Unsaved' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))
    expect(confirm).toHaveBeenCalledWith(
      'Discard unsaved person changes?',
      expect.any(String),
      expect.any(Function),
    )
  })
  it('keeps Archive off while the open person has unsaved edits', () => {
    show()
    openAlex()
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Alex renamed' },
    })
    expect(
      screen.getByRole('button', { name: 'Archive' }).hasAttribute('disabled'),
    ).toBe(true)
  })
  it('retains archive, restore, deletion and load-more paths', async () => {
    activeStatus = 'CanLoadMore'
    show()
    openAlex()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith('nutrition:setPersonArchived', {
        personId: alex._id,
        expectedEditRevision: 4,
        archived: true,
      }),
    )
    openAlex()
    fireEvent.click(
      screen.getByRole('button', { name: 'More actions for Alex' }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete permanently' }),
    )
    expect(confirm).toHaveBeenCalledWith(
      'Delete this person permanently?',
      'Person deleted.',
      expect.any(Function),
    )
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith('nutrition:deletePerson', {
        personId: alex._id,
        expectedEditRevision: 4,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more people' }))
    expect(loadMore).toHaveBeenCalledWith(20)
    fireEvent.click(screen.getByRole('switch', { name: 'Show archived' }))
    expect(
      screen.getByRole('button', { name: /^Edit Sam .*Archived/ }),
    ).toBeTruthy()
  })
  it('locks form controls while saving', () => {
    const view = show()
    fireEvent.click(screen.getByRole('button', { name: 'New person' }))
    pending = true
    const Component = Route.options.component as ComponentType
    view.rerender(<Component />)
    expect(
      (screen.getByLabelText('Person name') as HTMLInputElement).closest(
        'fieldset',
      )?.disabled,
    ).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: 'Create person',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    expect(
      (
        screen.getByRole('button', {
          name: 'Close editor',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
  })
})
