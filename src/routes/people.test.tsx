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
// The viewer's linked person; null shows "Which one is you?".
let linkedToMe: string | null = 'person-alex'
// What people.get returns for the person being edited.
let livePerson: typeof alex & {
  linkedAccount?: 'you' | 'other'
  macroGoals?: { proteinGPerKg?: number; fatG?: number }
} = alex
// The last success toast runAction would show.
let lastSuccess:
  { text: string; toast?: { action?: { onClick: () => void } } } | undefined
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
    runAction: async (
      text: string,
      action: () => Promise<unknown>,
      toast?: { action?: { onClick: () => void } },
    ) => {
      lastSuccess = { text, toast }
      return action()
    },
  }),
}))
vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) => (args: unknown) =>
    mutate(
      getFunctionName(reference as Parameters<typeof getFunctionName>[0]),
      args,
    ),
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) =>
    args === 'skip'
      ? undefined
      : getFunctionName(reference) === 'weight:latestOnOrBefore'
        ? { weightKg: 82.4, measuredOn: '2026-11-01' }
        : getFunctionName(reference) === 'people:linkedToMe'
          ? linkedToMe
          : livePerson,
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
      results: args.archived ? [sam] : [livePerson],
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
  linkedToMe = 'person-alex'
  livePerson = alex
  lastSuccess = undefined
  activeStatus = 'Exhausted'
  mutate.mockResolvedValue(null)
  confirm.mockImplementation(
    (_message: string, _label: string, action: () => Promise<unknown>) =>
      action(),
  )
  search = {}
  vi.spyOn(Route, 'useSearch').mockImplementation(() => search)
  vi.spyOn(Route, 'useNavigate').mockImplementation(() => navigate)
})
afterEach(cleanup)
let search: { edit?: string } = {}
const navigate = vi.fn()

describe('People settings', () => {
  it('asks which person is you until you link one', () => {
    show()
    expect(screen.queryByText('Which one is you?')).toBeNull()
    cleanup()

    linkedToMe = null
    show()
    expect(screen.getByRole('button', { name: 'I’m Alex' })).toBeTruthy()
  })

  it('creates a person and links it in one write', async () => {
    linkedToMe = null
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New person' }))
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Robi' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'This is me' }))
    mutate.mockResolvedValue('person-robi')
    fireEvent.click(screen.getByRole('button', { name: 'Create person' }))
    await waitFor(() =>
      expect(mutate.mock.calls.map(([name]) => name)).toEqual([
        'nutrition:createPerson',
      ]),
    )
    expect(mutate).toHaveBeenCalledWith(
      'nutrition:createPerson',
      expect.objectContaining({ name: 'Robi', linkedToMe: true }),
    )
    expect(lastSuccess?.text).toBe('Created Robi and linked to your account.')
    lastSuccess?.toast?.action?.onClick()
    await waitFor(() =>
      expect(mutate).toHaveBeenLastCalledWith('nutrition:setPersonLinkedToMe', {
        personId: 'person-robi',
        linked: false,
      }),
    )
  })

  it('saves a renamed person and the link together', async () => {
    show()
    openAlex()
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Alexa' },
    })
    fireEvent.click(screen.getByRole('switch', { name: 'This is me' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mutate.mock.calls.map(([name]) => name)).toEqual([
        'nutrition:updatePerson',
      ]),
    )
    expect(mutate).toHaveBeenCalledWith(
      'nutrition:updatePerson',
      expect.objectContaining({ name: 'Alexa', linkedToMe: true }),
    )
  })

  it('locks another member’s goal but keeps their name editable', async () => {
    livePerson = { ...alex, linkedAccount: 'other' }
    show()
    openAlex()
    expect(
      screen.queryByRole('spinbutton', { name: 'Daily calorie goal' }),
    ).toBeNull()
    expect(screen.getByText('Only Alex can change this goal.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Help me choose' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Person name'), {
      target: { value: 'Alexa' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        'nutrition:updatePerson',
        expect.objectContaining({ name: 'Alexa' }),
      ),
    )
    // Another member's goal isn't sent, even unchanged.
    expect(mutate.mock.lastCall?.[1]).not.toHaveProperty('goalKcal')
    expect(mutate.mock.lastCall?.[1]).not.toHaveProperty('macroGoals')
    expect(screen.queryByText('Macro goals')).toBeNull()
  })

  it('opens a person from a link, as Today’s macro goals link does', () => {
    search = { edit: 'person-alex' }
    show()
    expect(screen.getByLabelText('Person name')).toHaveProperty('value', 'Alex')
    expect(navigate).toHaveBeenCalledWith({ search: {}, replace: true })
  })

  it('saves a protein goal in grams a day by default', async () => {
    show()
    openAlex()
    fireEvent.change(screen.getByLabelText('Protein'), {
      target: { value: '140' },
    })
    fireEvent.change(screen.getByLabelText('Fat'), { target: { value: '70' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        'nutrition:updatePerson',
        expect.objectContaining({
          macroGoals: {
            proteinG: 140,
            proteinGPerKg: undefined,
            carbsG: undefined,
            fatG: 70,
          },
        }),
      ),
    )
  })

  it('keeps a protein goal per kg of body weight per kg', async () => {
    livePerson = { ...alex, macroGoals: { proteinGPerKg: 1.6, fatG: 70 } }
    show()
    openAlex()
    fireEvent.change(screen.getByLabelText('Fat'), { target: { value: '60' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        'nutrition:updatePerson',
        expect.objectContaining({
          macroGoals: {
            proteinG: undefined,
            proteinGPerKg: 1.6,
            carbsG: undefined,
            fatG: 60,
          },
        }),
      ),
    )
  })

  it('follows a link that changed elsewhere while the editor is open', () => {
    const view = show()
    openAlex()
    const toggle = screen.getByRole('switch', { name: 'This is me' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    livePerson = { ...alex, linkedAccount: 'you' }
    const Component = Route.options.component as ComponentType
    view.rerender(<Component />)
    expect(
      screen
        .getByRole('switch', { name: 'This is me' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.queryByText('Unsaved')).toBeNull()
  })

  it('links the person to the signed-in account only when the form saves', async () => {
    show()
    openAlex()
    fireEvent.click(screen.getByRole('switch', { name: 'This is me' }))
    expect(
      screen.getByText('Saving links this person to your account.'),
    ).toBeTruthy()
    expect(screen.getByText('Unsaved')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    // Only the link changed, so the profile and its edit revision stay put.
    await waitFor(() =>
      expect(mutate.mock.calls.map(([name]) => name)).toEqual([
        'nutrition:setPersonLinkedToMe',
      ]),
    )
    expect(mutate).toHaveBeenLastCalledWith('nutrition:setPersonLinkedToMe', {
      personId: alex._id,
      linked: true,
    })
  })

  it('fills the goal from the calculator and saves the plan with it', async () => {
    show()
    openAlex()
    fireEvent.click(screen.getByRole('button', { name: 'Help me choose' }))
    fireEvent.click(screen.getByRole('button', { name: 'Female' }))
    fireEvent.change(screen.getByLabelText('Year of birth'), {
      target: { value: '1988' },
    })
    fireEvent.change(screen.getByLabelText('Height'), {
      target: { value: '170' },
    })
    // The latest weigh-in fills the weight.
    expect((screen.getByLabelText('Weight') as HTMLInputElement).value).toBe(
      '82.4',
    )
    // One question per step.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: /^Lightly active/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lose' }))
    fireEvent.click(screen.getByRole('button', { name: 'See daily goal' }))
    fireEvent.click(screen.getByRole('button', { name: /^Use \d+ kcal$/ }))

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Use \d+ kcal$/ }),
      ).toBeNull(),
    )
    const goal = (
      screen.getByLabelText('Daily calorie goal') as HTMLInputElement
    ).value
    expect(Number(goal)).toBeLessThan(2000.5)
    expect(
      (screen.getByLabelText('Goal change reason') as HTMLInputElement).value,
    ).toBe('Calculator: lose 0.5% a week')
    expect(
      screen.getByText('Losing 0.5% a week. Saved with the goal.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        'nutrition:updatePerson',
        expect.objectContaining({
          goalKcal: Number(goal),
          reason: 'Calculator: lose 0.5% a week',
          energyProfile: {
            sex: 'female',
            birthYear: 1988,
            heightCm: 170,
            activity: 'lowActive',
          },
          goalPlan: { direction: 'lose', percentPerWeek: 0.5 },
        }),
      ),
    )
  })
  it('starts with a person list and opens goal history without a creation form', async () => {
    show()
    expect(screen.queryByLabelText('Person name')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Edit Alex 2001 kcal / day' }),
    ).toBeTruthy()
    expect(screen.queryByText('Consumed')).toBeNull()
    expect(screen.queryByText('Archived')).toBeNull()
    openAlex()
    // History waits behind its own row instead of lengthening the form.
    expect(screen.queryByText('Initial goal')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Goal history' }))
    expect(await screen.findByText('Initial goal')).toBeTruthy()
  })
  it('asks for a reason only once the goal changes', () => {
    show()
    openAlex()
    expect(screen.queryByLabelText('Goal change reason')).toBeNull()
    fireEvent.change(screen.getByLabelText('Daily calorie goal'), {
      target: { value: '1900' },
    })
    expect(screen.getByLabelText('Goal change reason')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Daily calorie goal'), {
      target: { value: '2000.5' },
    })
    expect(screen.queryByLabelText('Goal change reason')).toBeNull()
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
