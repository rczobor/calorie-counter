import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
import { requestLogMeal } from '@/features/meals/log-meal-request'
import type { MealDraft } from '@/features/meals/meal-draft'
import { applySavedLocale } from '@/i18n/locale'

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
    initialPersonId,
  }: {
    mealId?: string
    resumeDraft?: boolean
    initialPersonId?: string
  }) => (
    <>
      <p>Editor {mealId ?? (resumeDraft ? 'restored draft' : 'new meal')}</p>
      <p>Editor person {initialPersonId || 'none'}</p>
    </>
  ),
}))
vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mocks.query(...args),
  usePaginatedQuery: (...args: unknown[]) => mocks.page(...args),
  useMutation: () => mocks.mutate,
}))
import { Route } from './index'
import { DayDashboard } from '@/features/meals/day-dashboard'
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
let peopleLoading = false
let personLookupLoading = false
let mealsLoading = false
let consumedCalories = 1250
const nameOf = (ref: FunctionReference<'query'>) => getFunctionName(ref)
function show() {
  const Page = Route.options.component as ComponentType
  return render(<Page />)
}
async function switchPerson(name: string) {
  fireEvent.click(screen.getByRole('combobox', { name: /^Switch person/ }))
  fireEvent.keyDown(await screen.findByRole('option', { name }), {
    key: 'Enter',
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  loaded = [alex, sam]
  peopleLoading = false
  personLookupLoading = false
  mealsLoading = false
  consumedCalories = 1250
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
            ? (peopleLoading ? [] : loaded).map((p) => ({
                ...p,
                consumedCalories,
                goalKcal: 2200,
                remainingCalories: 2200 - consumedCalories,
                mealCount: 4,
              }))
            : args.personId === alex._id && !args.archived
              ? [meal]
              : [],
      status: (
        nameOf(ref) === 'people:listForDay' ? peopleLoading : mealsLoading
      )
        ? 'LoadingFirstPage'
        : 'Exhausted',
      loadMore: vi.fn(),
    }),
  )
  mocks.query.mockImplementation(
    (ref: FunctionReference<'query'>, args: { personId?: string } | 'skip') => {
      if (args === 'skip') return undefined
      if (nameOf(ref) === 'people:get')
        return personLookupLoading
          ? undefined
          : args.personId === alex._id
            ? alex
            : args.personId === sam._id
              ? sam
              : null
      if (nameOf(ref) === 'meals:getDayNutrition')
        return {
          personId: args.personId,
          person: 'Alex',
          eatenOn: '2026-11-02',
          consumedCalories,
          goalKcal: 2200,
          remainingCalories: 2200 - consumedCalories,
          mealCount: 4,
        }
      if (nameOf(ref) === 'meals:getDetail') return { meal, items: [item] }
      return undefined
    },
  )
})
afterEach(() => {
  cleanup()
  applySavedLocale(null)
  vi.useRealTimers()
})

describe('Today intake dashboard', () => {
  it.each([
    { logged: 1250, number: '950', label: 'kcal left' },
    { logged: 2200, number: '0', label: 'Goal reached' },
    { logged: 2368, number: '+168', label: 'kcal over' },
  ])(
    'distinguishes the balance when $logged kcal are logged',
    ({ logged, number, label }) => {
      consumedCalories = logged
      show()
      const intake = within(
        screen.getByRole('region', { name: 'Alex’s intake' }),
      )
      expect(intake.getByText(number)).toBeTruthy()
      expect(intake.getByText(label)).toBeTruthy()
    },
  )
  it('rolls the balance only while it changes in place', async () => {
    const Page = Route.options.component as ComponentType
    const view = show()
    const balance = () =>
      screen
        .getByRole('region', { name: /intake$/ })
        .querySelector('[data-number-flow]')
    const before = balance()
    // A meal logged for the same person and day updates the same figure.
    consumedCalories = 1500
    view.rerender(<Page />)
    expect(balance()).toBe(before)
    expect(screen.getByText('700')).toBeTruthy()
    // Crossing the goal swaps it rather than counting down to the overage.
    consumedCalories = 2300
    view.rerender(<Page />)
    const over = balance()
    expect(over).not.toBe(before)
    expect(screen.getByText('+100')).toBeTruthy()
    // Another day or person is a new figure, not a change to this one.
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    const yesterday = balance()
    expect(yesterday).not.toBe(over)
    await switchPerson('Sam')
    expect(balance()).not.toBe(yesterday)
  })
  it('shows server totals independently of loaded meals without mounting entry dependencies', () => {
    show()
    expect(screen.getAllByText('950')).toHaveLength(1)
    // The figures are styled apart from the label, so match the whole line.
    expect(
      screen.getAllByText(
        (_, element) =>
          element?.tagName === 'P' &&
          element.textContent === '1250 / 2200 kcal logged',
      ),
    ).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /^Sam/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'View history' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Archived meals' })).toBeNull()
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
    // The estimate is an icon by the food; its source opens on tap.
    expect(screen.queryByText('Recipe estimate: One bowl')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Estimated' }))
    expect(await screen.findByText('Recipe estimate: One bowl')).toBeTruthy()
    expect(screen.queryByText(/Editor/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit meal' }))
    expect(await screen.findByText('Editor meal-lunch')).toBeTruthy()
  })
  it('keeps device person selection and makes another person selectable', async () => {
    window.localStorage.setItem('calorie-counter:person:account:home', sam._id)
    show()
    expect(screen.getByRole('region', { name: 'Sam’s intake' })).toBeTruthy()
    expect(
      screen.getByRole('combobox', { name: /^Switch person/ }).textContent,
    ).toContain('Sam')
    await switchPerson('Alex')
    expect(screen.getByRole('region', { name: 'Alex’s intake' })).toBeTruthy()
    expect(
      window.localStorage.getItem('calorie-counter:person:account:home'),
    ).toBe(alex._id)
  })
  it('offers one Log meal action on an empty day, at every width', async () => {
    window.localStorage.setItem('calorie-counter:person:account:home', sam._id)
    show()
    // The heading's desktop button gives way to the in-list row.
    const actions = screen.getAllByRole('button', { name: 'Log meal' })
    expect(actions).toHaveLength(1)
    fireEvent.click(actions[0])
    expect(await screen.findByText(`Editor person ${sam._id}`)).toBeTruthy()
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
    expect(screen.getByRole('button', { name: 'Log meal' })).toHaveProperty(
      'disabled',
      true,
    )
    expect(
      window.localStorage.getItem('calorie-counter:person:account:home'),
    ).toBe('removed-person')
  })
  it('changes the date for both summaries and active meals', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'people:listForDay' && args.eatenOn === '2026-11-01',
      ),
    ).toBe(true)
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'meals:listForDay' && args.archived === true,
      ),
    ).toBe(false)
  })
  it('moves from yesterday to the new day when the app resumes after midnight', () => {
    show()
    expect(
      screen.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeTruthy()
    vi.setSystemTime(new Date('2026-11-03T07:00:00'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(
      screen.getByRole('heading', { name: 'Today', level: 1 }),
    ).toBeTruthy()
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'people:listForDay' && args.eatenOn === '2026-11-03',
      ),
    ).toBe(true)
  })
  it('keeps a past day selected when the app resumes after midnight', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    vi.setSystemTime(new Date('2026-11-03T07:00:00'))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    // Two days back once the new day starts.
    expect(
      screen.getByRole('heading', { name: 'Sun, Nov 1', level: 1 }),
    ).toBeTruthy()
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'people:listForDay' && args.eatenOn === '2026-11-03',
      ),
    ).toBe(false)
  })
  it('names and dates other days in Hungarian', () => {
    applySavedLocale('hu')
    show()
    expect(screen.getByRole('heading', { name: 'Ma', level: 1 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Előző nap' }))
    fireEvent.click(screen.getByRole('button', { name: 'Előző nap' }))
    expect(
      screen.getByRole('heading', { name: 'okt. 31., szombat', level: 1 }),
    ).toBeTruthy()
  })
  it('names the day once, in a title that picks the day', () => {
    show()
    const title = screen.getByRole('heading', { level: 1 })
    expect(
      within(title)
        .getByRole('button', { name: 'Today' })
        .getAttribute('aria-haspopup'),
    ).toBe('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(within(title).getByRole('button').textContent).toBe('Sat, Oct 31')
    expect(screen.getAllByText(/Oct 31/)).toHaveLength(1)
  })
  it('keeps archived meal recovery available on its settings page', () => {
    render(<DayDashboard archived />)
    expect(
      screen.getByRole('heading', { name: 'Archived meals', level: 1 }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Log meal' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Alex’s intake' })).toBeNull()
    expect(
      screen.getByRole('combobox', { name: /^Switch person/ }).textContent,
    ).toContain('Alex')
    expect(
      mocks.page.mock.calls.some(
        ([ref, args]) =>
          nameOf(ref) === 'meals:listForDay' && args.archived === true,
      ),
    ).toBe(true)
  })
  it('keeps date controls mounted while initial intake and meals load', () => {
    peopleLoading = true
    const view = show()
    const previous = screen.getByRole('button', { name: 'Previous day' })
    expect(
      screen.getByRole('status', { name: 'Loading daily intake' }),
    ).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Loading meals' })).toBeTruthy()
    expect(screen.queryByText(/Loading/)).toBeNull()
    peopleLoading = false
    const Page = Route.options.component as ComponentType
    view.rerender(<Page />)
    expect(screen.getByRole('region', { name: 'Alex’s intake' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous day' })).toBe(previous)
    expect(
      screen.queryByRole('status', { name: 'Loading daily intake' }),
    ).toBeNull()
  })
  it('opens a Log meal request from another tab for the saved person while people load', async () => {
    window.localStorage.setItem('calorie-counter:person:account:home', sam._id)
    peopleLoading = true
    personLookupLoading = true
    requestLogMeal()
    show()
    expect(await screen.findByText(`Editor person ${sam._id}`)).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Log meal' }))
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
