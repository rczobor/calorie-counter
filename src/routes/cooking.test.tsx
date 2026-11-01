import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName, type FunctionReference } from 'convex/server'
import {
  asId,
  createCookSessionDoc,
  createCookedFoodDoc,
  createCookedFoodIngredientDoc,
  createPersonDoc,
} from '@/tests/factories'
import { createCookingDraft } from '@/features/cooking/draft-helpers'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  page: vi.fn(),
  mutation: vi.fn(),
  save: vi.fn(),
  sessionSave: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
  create: vi.fn(),
  recipe: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/features/households/convex-hooks', () => ({
  useQuery: (...args: unknown[]) => mocks.query(...args),
  usePaginatedQuery: (...args: unknown[]) => mocks.page(...args),
  useMutation: (ref: FunctionReference<'mutation'>) =>
    mocks.mutation(getFunctionName(ref)),
}))
vi.mock('@/features/cooking/draft-persistence-identity', () => ({
  useDraftPersistenceIdentity: () => ({
    isLoaded: true,
    userId: 'test-user:household',
  }),
}))
vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toast(...args),
    warning: (...args: unknown[]) => mocks.toast(...args),
    error: (...args: unknown[]) => mocks.toast(...args),
  },
}))
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...original,
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useBlocker: () => ({ status: 'idle', reset: vi.fn(), proceed: vi.fn() }),
  }
})
import { Route } from './cooking'
const Page = Route.options.component as ComponentType
const food = createCookedFoodDoc('food-1', 'session-1', 'Chili', {
  groupId: undefined,
  finishedWeightGrams: 1000,
  totalCalories: 1200,
  kcalPer100: 120,
  editRevision: 4,
  nutritionProvenance: {
    source: 'Recipe estimate',
    assumptions: 'Ingredient nutrition estimated.',
  },
})
const lines = [
  createCookedFoodIngredientDoc('line-1', 'food-1', {
    ingredientId: asId<'ingredients'>('ingredient-1'),
    ingredientNameSnapshot: 'Historical beans',
    ingredientKcalPer100Snapshot: 115,
    ingredientKcalBasisUnitSnapshot: 'g',
    referenceAmount: 500,
    referenceUnit: 'g',
    countedAmount: 500,
    notes: '  preserve exact note\n',
  }),
  createCookedFoodIngredientDoc('line-2', 'food-1', {
    sourceType: 'custom',
    ingredientNameSnapshot: 'Oil',
    ingredientKcalPer100Snapshot: 800,
    ingredientKcalBasisUnitSnapshot: 'ml',
    referenceAmount: 15,
    referenceUnit: 'ml',
    countedAmount: 15,
    nutritionProvenance: {
      kind: 'provided',
      source: 'Label',
      assumptions: '800 kcal/100ml',
    },
  }),
]
const session = createCookSessionDoc('session-1', 'Weekend cooking', {
  cookedAt: new Date('2026-10-31T08:42:16Z').getTime(),
  editRevision: 2,
})
const detail = {
  cookedFood: food,
  ingredients: lines,
  cookSession: { ...session, cookedByPersonName: 'Alex' },
  group: null,
  linkedRecipe: null,
}
let currentDetail: typeof detail | null | undefined
let showFoods = true

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/cooking')
  currentDetail = detail
  showFoods = true
  mocks.save.mockResolvedValue({
    cookedFoodId: food._id,
    cookedFoodIngredientIds: lines.map((l) => l._id),
    editRevision: 5,
  })
  mocks.create.mockResolvedValue({
    cookedFoodId: asId<'cookedFoods'>('recovered-food'),
    cookedFoodIngredientIds: [],
    editRevision: 0,
  })
  mocks.sessionSave.mockResolvedValue(null)
  mocks.archive.mockResolvedValue(null)
  mocks.remove.mockResolvedValue(null)
  mocks.recipe.mockResolvedValue('recipe')
  mocks.mutation.mockImplementation(
    (name: string) =>
      ({
        'nutrition:updateCookedFood': mocks.save,
        'nutrition:createCookedFood': mocks.create,
        'nutrition:updateCookSession': mocks.sessionSave,
        'nutrition:setCookedFoodArchived': mocks.archive,
        'nutrition:setCookSessionArchived': mocks.archive,
        'nutrition:deleteCookedFood': mocks.remove,
        'nutrition:deleteCookSession': mocks.remove,
        'nutrition:createRecipe': mocks.recipe,
      })[name],
  )
  mocks.query.mockImplementation(
    (ref: FunctionReference<'query'>, args: unknown) => {
      if (args === 'skip') return undefined
      const name = getFunctionName(ref)
      if (name === 'cooking:getCookedFoodDetail') return currentDetail
      if (name === 'cooking:getSession')
        return { ...session, cookedByPersonName: 'Alex' }
      if (name.startsWith('cooking:search')) return []
      return undefined
    },
  )
  mocks.page.mockImplementation(
    (
      ref: FunctionReference<'query'>,
      args: { archived?: boolean } | 'skip',
    ) => {
      if (args === 'skip')
        return { results: [], status: 'Exhausted', loadMore: vi.fn() }
      const name = getFunctionName(ref)
      const results =
        name === 'cooking:listSessions'
          ? [session]
          : name === 'people:list'
            ? [createPersonDoc('person-1', 'Alex')]
            : showFoods && !args.archived
              ? [food]
              : []
      return { results, status: 'Exhausted', loadMore: vi.fn() }
    },
  )
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('cooked batches', () => {
  it('starts with inspection, avoiding catalog queries and manual creation controls', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: 'Cooked batches' })).toBeTruthy()
    expect(screen.queryByText('Food editor')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Start cooking' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Duplicate current' }),
    ).toBeNull()
    expect(
      mocks.page.mock.calls.some(([ref]) =>
        getFunctionName(ref).startsWith('catalog:'),
      ),
    ).toBe(false)
    expect(
      mocks.query.mock.calls.some(
        ([ref, args]) =>
          getFunctionName(ref) === 'cooking:getCookedFoodDetail' &&
          args !== 'skip',
      ),
    ).toBe(false)
  })
  it('loads only opened food details and reveals historical nutrition and source notes', async () => {
    render(<Page />)
    fireEvent.click(screen.getByText('Chili'))
    await waitFor(() =>
      expect(screen.getByText('Historical beans')).toBeTruthy(),
    )
    expect(
      screen.getByText('Recipe estimate: Ingredient nutrition estimated.'),
    ).toBeTruthy()
    expect(screen.getByText('800 kcal/100ml', { exact: false })).toBeTruthy()
    expect(screen.getByText('preserve exact note')).toBeTruthy()
  })
  it('edits the selected snapshot without losing line identities, units, notes, or the original revision', async () => {
    render(<Page />)
    fireEvent.click(screen.getByText('Chili'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit cooked food' }),
    )
    fireEvent.change(screen.getByLabelText('Finished weight (g)'), {
      target: { value: '1250' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect(mocks.save.mock.calls[0][0]).toMatchObject({
      cookedFoodId: food._id,
      expectedEditRevision: 4,
      expectedCookedFoodIngredientIds: ['line-1', 'line-2'],
      finishedWeightGrams: 1250,
      ingredients: [
        {
          existingCookedFoodIngredientId: 'line-1',
          notes: '  preserve exact note\n',
        },
        {
          existingCookedFoodIngredientId: 'line-2',
          kcalBasisUnit: 'ml',
          countedAmount: 15,
          nutritionProvenance: lines[1].nutritionProvenance,
        },
      ],
    })
    expect(
      window.sessionStorage.getItem(
        'calorie-counter:cooking-edit:test-user:household',
      ),
    ).toBeNull()
  })
  it('keeps failed edits recoverable and does not adopt a newer remote revision', async () => {
    mocks.save.mockRejectedValue(
      new Error('Cooked food changed since editing began.'),
    )
    const rendered = render(<Page />)
    fireEvent.click(screen.getByText('Chili'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit cooked food' }),
    )
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'My unsaved chili' },
    })
    currentDetail = {
      ...detail,
      cookedFood: { ...food, editRevision: 9, name: 'Remote change' },
    }
    rendered.rerender(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('alert')
    expect(mocks.save.mock.calls[0][0].expectedEditRevision).toBe(4)
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'My unsaved chili',
    )
    expect(
      window.sessionStorage.getItem(
        'calorie-counter:cooking-edit:test-user:household',
      ),
    ).toContain('My unsaved chili')
  })
  it('keeps the complete original line set when composition rows are removed', async () => {
    render(<Page />)
    fireEvent.click(screen.getByText('Chili'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit cooked food' }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Historical beans' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalled())
    expect(mocks.save.mock.calls[0][0].expectedCookedFoodIngredientIds).toEqual(
      ['line-1', 'line-2'],
    )
    expect(mocks.save.mock.calls[0][0].ingredients).toHaveLength(1)
  })
  it('preserves the exact original timestamp on a label-only batch edit', async () => {
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Batches' }))
    fireEvent.click(screen.getByText('Manage'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit batch' }))
    fireEvent.change(screen.getByLabelText('Batch label'), {
      target: { value: 'Updated label' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save batch' }))
    await waitFor(() => expect(mocks.sessionSave).toHaveBeenCalled())
    expect(mocks.sessionSave.mock.calls[0][0]).toMatchObject({
      label: 'Updated label',
      cookedAt: session.cookedAt,
      expectedEditRevision: 2,
      cookedByPersonId: session.cookedByPersonId,
    })
    expect(mocks.sessionSave.mock.calls[0][0]).not.toHaveProperty('cookedOn')
  })
  it('preserves old drafts until explicit recovery or confirmed discard', () => {
    const draft = createCookingDraft(asId<'cookSessions'>('session-1'), {
      name: 'Unfinished soup',
    })
    const key = 'calorie-counter:cooking-drafts:test-user:household',
      serialized = JSON.stringify({ version: 1, drafts: [draft] })
    window.localStorage.setItem(key, serialized)
    render(<Page />)
    expect(screen.getByText('Unfinished soup')).toBeTruthy()
    expect(window.localStorage.getItem(key)).toBe(serialized)
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard old workspace' }),
    )
    expect(window.localStorage.getItem(key)).toBe(serialized)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(window.localStorage.getItem(key)).toBe(serialized)
    fireEvent.click(screen.getByRole('button', { name: 'Recover draft' }))
    expect(
      screen.getByRole('heading', { name: 'Recover cooking draft' }),
    ).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Unfinished soup',
    )
  })
  it('uses an explicit session deep link without loading another session by default', () => {
    window.history.replaceState(
      null,
      '',
      '/cooking?sessionId=abcdefghijklmnopqrst',
    )
    render(<Page />)
    expect(
      mocks.query.mock.calls.some(
        ([ref, args]) =>
          getFunctionName(ref) === 'cooking:getSession' &&
          args.sessionId === 'abcdefghijklmnopqrst',
      ),
    ).toBe(true)
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          getFunctionName(ref) === 'cooking:listCookedFoodsForSession' &&
          args.cookSessionId === 'abcdefghijklmnopqrst',
      ),
    ).toBe(true)
  })
  it('retains a recovered create receipt when old-workspace cleanup fails', async () => {
    const draft = createCookingDraft(asId<'cookSessions'>('session-1'), {
      name: 'Recovered soup',
      finishedWeight: '1000',
      ingredientLines: [
        {
          draftId: 'recovered-line',
          sourceType: 'custom',
          name: 'Beans',
          kcalPer100: 100,
          kcalBasisUnit: 'g',
          ignoreCalories: false,
          referenceAmount: 1000,
          referenceUnit: 'g',
          countedAmount: 1000,
          saveToCatalog: false,
        },
      ],
    })
    const key = 'calorie-counter:cooking-drafts:test-user:household'
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: 1, drafts: [draft] }),
    )
    const write = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      name: string,
      value: string,
    ) {
      if (name === key) throw new Error('Workspace storage blocked')
      write.call(this, name, value)
    })
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: 'Recover draft' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save recovered cooking' }),
    )
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole('button', { name: 'Open recovered food' }),
    ).toBeTruthy()
    expect(
      window.sessionStorage.getItem(
        'calorie-counter:cooking-edit:test-user:household',
      ),
    ).toContain('recovered-food')
    fireEvent.click(screen.getByRole('button', { name: 'Open recovered food' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(
        expect.objectContaining({ cookedFoodId: 'recovered-food' }),
      ),
    )
    expect(mocks.create).toHaveBeenCalledTimes(1)
  })

  it('keeps resumed unsaved edits protected and prevents another editor replacing them', async () => {
    render(<Page />)
    fireEvent.click(screen.getByText('Chili'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit cooked food' }),
    )
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Unfinished chili' },
    })
    cleanup()
    render(<Page />)
    fireEvent.click(screen.getByText('Chili'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Edit cooked food' }),
    )
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringContaining('Resume or discard'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Resume edit' }))
    expect(screen.getByLabelText('Name')).toHaveProperty(
      'value',
      'Unfinished chili',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(
      window.sessionStorage.getItem(
        'calorie-counter:cooking-edit:test-user:household',
      ),
    ).toContain('Unfinished chili')
  })
})
