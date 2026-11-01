import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ComponentType, ReactNode } from 'react'
import { getFunctionName, type FunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMealDoc,
  createMealItemDoc,
  createPersonDoc,
} from '@/tests/factories'
import { writeMealDraft } from '@/features/meals/meal-draft'
import type { MealDraft } from '@/features/meals/meal-draft'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  page: vi.fn(),
  mutate: vi.fn(),
}))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useRouterState: () => window.location.search,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
vi.mock('@/features/cooking/draft-persistence-identity', () => ({
  useDraftPersistenceIdentity: () => ({
    isLoaded: true,
    userId: 'account:home',
  }),
}))
vi.mock('@/features/meals/meal-editor', () => ({
  MealEditor: ({
    mealId,
    resumeDraft,
  }: {
    mealId?: string
    resumeDraft?: boolean
  }) => <p>Editor {mealId ?? (resumeDraft ? 'restored draft' : 'new meal')}</p>,
}))
vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mocks.query(...args),
  usePaginatedQuery: (...args: unknown[]) => mocks.page(...args),
  useMutation: () => mocks.mutate,
}))
import { Route } from './index'
const alex = createPersonDoc('abcdefghijklmnopqrst', 'Alex')
const sam = createPersonDoc('uvwxyzabcdefghijklmn', 'Sam')
const meal = createMealDoc('meal-lunch', alex._id, {
  name: 'Lunch',
  totalCalories: 250,
  itemCount: 1,
  eatenOn: '2026-11-02',
})
const item = createMealItemDoc('item-chili', meal._id, {
  sourceType: 'fixedCalories',
  nameSnapshot: 'Chili',
  caloriesSnapshot: 250,
  nutritionProvenance: { source: 'Recipe estimate', assumptions: 'One bowl' },
})
let loaded = [alex, sam]
const nameOf = (ref: FunctionReference<'query'>) => getFunctionName(ref)
function show() {
  const Page = Route.options.component as ComponentType
  return render(<Page />)
}
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  loaded = [alex, sam]
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-02T12:00:00'))
  mocks.page.mockImplementation(
    (
      ref: FunctionReference<'query'>,
      args: { personId?: string; archived?: boolean } | 'skip',
    ) => ({
      results:
        args === 'skip'
          ? []
          : nameOf(ref) === 'people:listForDay'
            ? loaded.map((p) => ({
                ...p,
                consumedCalories: 1250,
                goalKcal: 2200,
                remainingCalories: 950,
                mealCount: 4,
              }))
            : args.personId === alex._id && !args.archived
              ? [meal]
              : [],
      status: 'Exhausted',
      loadMore: vi.fn(),
    }),
  )
  mocks.query.mockImplementation(
    (ref: FunctionReference<'query'>, args: { personId?: string } | 'skip') => {
      if (args === 'skip') return undefined
      if (nameOf(ref) === 'people:get')
        return args.personId === alex._id
          ? alex
          : args.personId === sam._id
            ? sam
            : null
      if (nameOf(ref) === 'meals:getDayNutrition')
        return {
          personId: args.personId,
          person: 'Alex',
          eatenOn: '2026-11-02',
          consumedCalories: 1250,
          goalKcal: 2200,
          remainingCalories: 950,
          mealCount: 4,
        }
      if (nameOf(ref) === 'meals:getDetail') return { meal, items: [item] }
      return undefined
    },
  )
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Today intake dashboard', () => {
  it('shows server totals independently of loaded meals without mounting entry dependencies', () => {
    show()
    expect(screen.getAllByText('950')).toHaveLength(2)
    expect(screen.getAllByText('1250 / 2200 kcal logged')).toHaveLength(2)
    expect(screen.queryByLabelText('Meal name')).toBeNull()
    expect(screen.queryByText(/Editor/)).toBeNull()
    expect(mocks.page.mock.calls.map(([ref]) => nameOf(ref))).not.toContain(
      'catalog:listIngredients',
    )
    expect(
      mocks.page.mock.calls
        .map(([ref]) => nameOf(ref))
        .some((name) => name.startsWith('cooking:')),
    ).toBe(false)
  })
  it('opens recorded nutrition before editing and loads its editor only on request', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: /Lunch/ }))
    expect(screen.getByText('Chili')).toBeTruthy()
    expect(screen.getByText('Recipe estimate: One bowl')).toBeTruthy()
    expect(screen.queryByText(/Editor/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    expect(await screen.findByText('Editor meal-lunch')).toBeTruthy()
  })
  it('keeps device person selection and makes another person selectable', () => {
    window.localStorage.setItem('calorie-counter:person:account:home', sam._id)
    show()
    expect(
      screen.getByRole('button', { name: /^Sam/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /^Alex/ }))
    expect(
      window.localStorage.getItem('calorie-counter:person:account:home'),
    ).toBe(alex._id)
  })
  it('honors linked person/date before browser selection and point-loads off-page people', () => {
    loaded = [alex]
    window.localStorage.setItem('calorie-counter:person:account:home', alex._id)
    window.history.replaceState(
      null,
      '',
      '/?personId=' + sam._id + '&date=2026-10-30',
    )
    show()
    expect(
      mocks.query.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'people:get' && args.personId === sam._id,
      ),
    ).toBe(true)
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'meals:listForDay' &&
          args.personId === sam._id &&
          args.eatenOn === '2026-10-30',
      ),
    ).toBe(true)
  })
  it('does not silently replace an unavailable selected person', () => {
    window.localStorage.setItem(
      'calorie-counter:person:account:home',
      'removed-person',
    )
    show()
    expect(screen.getByText(/selected person is unavailable/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add meal' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      window.localStorage.getItem('calorie-counter:person:account:home'),
    ).toBe('removed-person')
  })
  it('changes the date for both summaries and meals and keeps archive inspection secondary', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'people:listForDay' && args.eatenOn === '2026-11-01',
      ),
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Archived meals' }))
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'meals:listForDay' && args.archived === true,
      ),
    ).toBe(true)
  })
  it('protects an existing draft and offers explicit continuation or discard', async () => {
    const draft: MealDraft = {
      selectedPersonId: alex._id,
      mealDate: '2026-11-02',
      mealName: 'Unfinished',
      editingMealId: null,
      mealItems: [],
      expectedMealEditRevision: 0,
      expectedMealItemIds: [],
      itemMode: 'quick',
      itemQuickName: 'Bread',
      itemQuickCalories: '',
      itemIngredientId: '',
      selectedCookSessionId: '',
      itemCookedFoodId: '',
      itemCustomName: '',
      itemCustomKcalPer100: '',
      itemCustomIgnoreCalories: false,
      itemCustomSaveToCatalog: true,
      itemWeight: '',
      editingDraftItemIndex: null,
    }
    writeMealDraft('account:home', JSON.stringify({ version: 1, draft }))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Add meal' }))
    expect(
      screen.getByText(/Continue or discard your existing draft/),
    ).toBeTruthy()
    expect(screen.queryByText(/Editor/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Continue draft' }))
    await waitFor(() =>
      expect(screen.getByText('Editor restored draft')).toBeTruthy(),
    )
  })
})
