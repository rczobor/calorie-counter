// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../convex/_generated/dataModel'

const groupLoadMore = vi.fn()
const ingredientLoadMore = vi.fn()
const recipeLoadMore = vi.fn()
const queryCalls: Array<{ name: string; args: unknown }> = []
const mutationCalls: Array<{ name: string; args: unknown }> = []

let paginationStatus: PaginationStatus = 'CanLoadMore'

const foodGroup = {
  _id: 'group-1' as Id<'foodGroups'>,
  _creationTime: 1,
  name: 'Staples',
  appliesTo: 'ingredient' as const,
  archived: false,
  editRevision: 3,
  createdAt: 1,
}

const archivedFoodGroup = {
  ...foodGroup,
  _id: 'group-archived' as Id<'foodGroups'>,
  name: 'Legacy staples',
  archived: true,
}

const unloadedActiveFoodGroup = {
  ...foodGroup,
  _id: 'group-unloaded-active' as Id<'foodGroups'>,
  name: 'Later-page staples',
}

const ingredient = {
  _id: 'ingredient-1' as Id<'ingredients'>,
  _creationTime: 1,
  name: 'Oats',
  brand: 'Mill',
  kcalPer100: 370,
  kcalBasisUnit: 'g' as const,
  ignoreCalories: false,
  groupId: foodGroup._id,
  groupName: foodGroup.name,
  groupArchived: false,
  archived: false,
  editRevision: 4,
  createdAt: 1,
}

const ingredientWithArchivedGroup = {
  ...ingredient,
  _id: 'ingredient-archived-group' as Id<'ingredients'>,
  name: 'Millet',
  groupId: archivedFoodGroup._id,
  groupName: archivedFoodGroup.name,
  groupArchived: true,
}

const ingredientWithUnloadedActiveGroup = {
  ...ingredient,
  _id: 'ingredient-unloaded-active-group' as Id<'ingredients'>,
  name: 'Barley',
  groupId: unloadedActiveFoodGroup._id,
  groupName: unloadedActiveFoodGroup.name,
  groupArchived: false,
}

const ingredientPerPiece = {
  ...ingredient,
  _id: 'ingredient-per-piece' as Id<'ingredients'>,
  name: 'Egg',
  kcalPer100: 155,
  kcalBasisUnit: 'piece' as const,
}

const fractionalIngredient = {
  ...ingredient,
  _id: 'ingredient-fractional' as Id<'ingredients'>,
  name: 'Oat milk',
  kcalPer100: 52.5,
  macros: { proteinG: 1, carbsG: 6.5, fatG: 1.5 },
}

const notCountedIngredient = {
  ...ingredient,
  _id: 'ingredient-not-counted' as Id<'ingredients'>,
  name: 'Black coffee',
  brand: undefined,
  kcalPer100: 2,
  kcalBasisUnit: 'ml' as const,
  ignoreCalories: true,
}

const recipe = {
  _id: 'recipe-1' as Id<'recipes'>,
  _creationTime: 1,
  name: 'Overnight oats',
  archived: false,
  editRevision: 0,
  latestVersionNumber: 2,
  createdAt: 1,
}

const recipeDetail = {
  recipe,
  version: {
    _id: 'recipe-version-1' as Id<'recipeVersions'>,
    _creationTime: 1,
    recipeId: recipe._id,
    versionNumber: 2,
    name: recipe.name,
    instructions: 'Chill overnight.',
    createdAt: 1,
  },
  ingredients: [
    {
      _id: 'recipe-line-1' as Id<'recipeVersionIngredients'>,
      _creationTime: 1,
      recipeVersionId: 'recipe-version-1' as Id<'recipeVersions'>,
      sourceType: 'ingredient' as const,
      ingredientId: ingredient._id,
      ingredientNameSnapshot: ingredient.name,
      kcalPer100Snapshot: ingredient.kcalPer100,
      kcalBasisUnitSnapshot: 'g' as const,
      ignoreCaloriesSnapshot: false,
      referenceAmount: 80,
      referenceUnit: 'g' as const,
      notes: 'Keep this line note.',
    },
    {
      _id: 'recipe-line-2' as Id<'recipeVersionIngredients'>,
      _creationTime: 2,
      recipeVersionId: 'recipe-version-1' as Id<'recipeVersions'>,
      sourceType: 'custom' as const,
      ingredientId: ingredient._id,
      ingredientNameSnapshot: 'Saved custom oats',
      kcalPer100Snapshot: 360,
      kcalBasisUnitSnapshot: 'ml' as const,
      ignoreCaloriesSnapshot: false,
      referenceAmount: 20,
      referenceUnit: 'g' as const,
      notes: 'Keep this custom link.',
    },
  ],
}

let recipeDetailResult: typeof recipeDetail | undefined = recipeDetail

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...original,
    Link: ({
      to,
      children,
      className,
    }: {
      to: string
      children: import('react').ReactNode
      className?: string
    }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  }
})
vi.mock('@/features/manage/saved-foods', () => ({
  SavedFoods: () => <p>Saved foods</p>,
}))
vi.mock('@/integrations/convex/config', () => ({
  isConvexConfigured: true,
}))

vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    pendingConfirmation: null,
    isConfirmDialogOpen: false,
    isRunning: false,
    runAction: async (_successText: string, action: () => Promise<unknown>) =>
      action(),
    confirmAndRunAction: vi.fn(),
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
  }),
}))

vi.mock('convex/react', () => ({
  useMutation: (reference: unknown) =>
    vi.fn(async (args: unknown) => {
      mutationCalls.push({ name: getFunctionName(reference as never), args })
    }),
  usePaginatedQuery: (reference: unknown, args: unknown) => {
    if (args === 'skip') {
      return paginated([], 'Exhausted', vi.fn())
    }
    const name = getFunctionName(reference as never)
    const archived = (args as { archived: boolean }).archived
    if (archived) {
      return paginated([], 'Exhausted', vi.fn())
    }
    if (name === 'catalog:listFoodGroups') {
      return paginated([foodGroup], paginationStatus, groupLoadMore)
    }
    if (name === 'catalog:listIngredients') {
      return paginated(
        [
          ingredient,
          ingredientWithArchivedGroup,
          ingredientWithUnloadedActiveGroup,
          ingredientPerPiece,
          fractionalIngredient,
          notCountedIngredient,
        ],
        paginationStatus,
        ingredientLoadMore,
      )
    }
    if (name === 'catalog:listRecipes') {
      return paginated([recipe], paginationStatus, recipeLoadMore)
    }
    throw new Error(`Unexpected paginated query: ${name}`)
  },
  useQuery: (reference: unknown, args: unknown) => {
    const name = getFunctionName(reference as never)
    queryCalls.push({ name, args })
    if (args === 'skip') {
      return undefined
    }
    if (name === 'recipes:getCurrent') {
      return recipeDetailResult
    }
    if (name === 'catalog:searchIngredients') {
      return [
        {
          ...ingredient,
          _id: 'ingredient-2' as Id<'ingredients'>,
          name: 'Quinoa',
        },
      ]
    }
    if (name === 'catalog:searchFoodGroups') {
      return [foodGroup]
    }
    if (name === 'catalog:searchRecipes') {
      return [recipe]
    }
    throw new Error(`Unexpected query: ${name}`)
  },
}))

import { Route as CatalogRoute } from '@/routes/catalog'

// These tests cover the sections themselves; catalog-sections.test.tsx
// covers reaching them through the router.
let section: 'ingredients' | 'recipes' = 'ingredients'

beforeEach(() => {
  vi.clearAllMocks()
  section = 'ingredients'
  vi.spyOn(CatalogRoute, 'useSearch').mockImplementation(() => ({ section }))
  queryCalls.length = 0
  mutationCalls.length = 0
  paginationStatus = 'CanLoadMore'
  recipeDetailResult = recipeDetail
})

afterEach(cleanup)

describe('Catalog route', () => {
  it('uses bounded lists, explicit load-more controls, and server search', async () => {
    renderCatalogRoute()

    expect(screen.getByText('Oats')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more ingredients' }),
    )
    expect(ingredientLoadMore).toHaveBeenCalledWith(20)
    fireEvent.click(screen.getByRole('button', { name: 'New ingredient' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more ingredient groups' }),
    )
    expect(groupLoadMore).toHaveBeenCalledWith(20)
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))

    fireEvent.change(screen.getByLabelText('Search ingredients'), {
      target: { value: 'quinoa' },
    })
    await waitFor(() => expect(screen.getByText('Quinoa')).toBeTruthy())
    expect(queryCalls).toContainEqual({
      name: 'catalog:searchIngredients',
      args: { archived: false, search: 'quinoa' },
    })
    expect(
      screen.queryByRole('button', { name: 'Load more ingredients' }),
    ).toBeNull()
  })

  it('loads only the selected recipe detail and hydrates its draft once', async () => {
    section = 'recipes'
    const view = renderCatalogRoute()

    expect(
      queryCalls.some(
        (call) => call.name === 'recipes:getCurrent' && call.args !== 'skip',
      ),
    ).toBe(false)

    recipeDetailResult = undefined
    openRecord('Overnight oats')

    expect(
      (screen.getByRole('button', { name: 'Save recipe' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (
        screen.getByLabelText('Recipe instructions') as HTMLTextAreaElement
      ).closest('fieldset')?.disabled,
    ).toBe(true)

    recipeDetailResult = recipeDetail
    const Component = CatalogRoute.options.component as ComponentType
    view.rerender(<Component />)

    await waitFor(() =>
      expect(
        (screen.getByLabelText('Recipe instructions') as HTMLTextAreaElement)
          .value,
      ).toBe('Chill overnight.'),
    )
    expect(
      (screen.getByRole('button', { name: 'Save recipe' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
    expect(
      (screen.getByLabelText('Recipe instructions') as HTMLTextAreaElement)
        .value,
    ).toBe('Chill overnight.')
    expect(screen.getByDisplayValue('80')).toBeTruthy()
    expect(screen.getAllByText('370 kcal/100 g').length).toBeGreaterThan(0)
    expect(queryCalls).toContainEqual({
      name: 'recipes:getCurrent',
      args: { recipeId: recipe._id },
    })

    const customBasisSelect = screen.getByLabelText(
      'Saved custom oats kcal basis',
    )
    expect(customBasisSelect.textContent).toContain('ml')
    fireEvent.click(customBasisSelect)
    const pieceOption = await screen.findByRole('option', { name: 'piece' })
    fireEvent.pointerDown(pieceOption, { button: 0 })
    fireEvent.pointerUp(pieceOption, { button: 0 })
    fireEvent.click(pieceOption)

    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateRecipeCurrentVersion',
        args: expect.objectContaining({
          recipeId: recipe._id,
          ingredientLines: [
            expect.objectContaining({
              existingRecipeVersionIngredientId:
                recipeDetail.ingredients[0]._id,
              ingredientId: ingredient._id,
              notes: 'Keep this line note.',
            }),
            expect.objectContaining({
              sourceType: 'custom',
              existingRecipeVersionIngredientId:
                recipeDetail.ingredients[1]._id,
              ingredientId: ingredient._id,
              kcalBasisUnit: 'piece',
              notes: 'Keep this custom link.',
            }),
          ],
        }),
      }),
    )
  })

  it('preserves recipe version ingredient identities on an instructions-only save', async () => {
    section = 'recipes'
    renderCatalogRoute()
    openRecord('Overnight oats')
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Recipe instructions') as HTMLTextAreaElement)
          .value,
      ).toBe('Chill overnight.'),
    )

    fireEvent.change(screen.getByLabelText('Recipe instructions'), {
      target: { value: 'Chill for two nights.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save recipe' }))

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateRecipeCurrentVersion',
        args: expect.objectContaining({
          expectedRecipeVersionId: recipeDetail.version._id,
          instructions: 'Chill for two nights.',
          ingredientLines: [
            expect.objectContaining({
              existingRecipeVersionIngredientId:
                recipeDetail.ingredients[0]._id,
            }),
            expect.objectContaining({
              existingRecipeVersionIngredientId:
                recipeDetail.ingredients[1]._id,
            }),
          ],
        }),
      }),
    )
  })

  it('preserves local recipe edits when a newer live version arrives', async () => {
    section = 'recipes'
    const view = renderCatalogRoute()
    openRecord('Overnight oats')
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Recipe instructions') as HTMLTextAreaElement)
          .value,
      ).toBe('Chill overnight.'),
    )
    fireEvent.change(screen.getByLabelText('Recipe instructions'), {
      target: { value: 'My unsaved instructions' },
    })

    recipeDetailResult = {
      ...recipeDetail,
      recipe: { ...recipe, latestVersionNumber: 3 },
      version: {
        ...recipeDetail.version,
        _id: 'recipe-version-remote' as Id<'recipeVersions'>,
        versionNumber: 3,
        instructions: 'Remote instructions',
      },
    }
    const Component = CatalogRoute.options.component as ComponentType
    view.rerender(<Component />)

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'changed elsewhere',
      ),
    )
    expect(
      (screen.getByLabelText('Recipe instructions') as HTMLTextAreaElement)
        .value,
    ).toBe('My unsaved instructions')
    expect(
      (screen.getByRole('button', { name: 'Save recipe' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('retains a server-search ingredient after the search changes', async () => {
    section = 'recipes'
    renderCatalogRoute()
    fireEvent.click(screen.getByRole('button', { name: 'New recipe' }))
    fireEvent.change(screen.getByLabelText('Search recipe ingredients'), {
      target: { value: 'quinoa' },
    })

    const quinoaRow = await screen.findByRole('button', { name: /^Quinoa/ })
    fireEvent.click(quinoaRow)
    expect(quinoaRow.getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByLabelText('Search recipe ingredients'), {
      target: { value: '' },
    })

    expect(
      (screen.getByLabelText('Selected recipe ingredient') as HTMLInputElement)
        .value,
    ).toContain('Quinoa')
    fireEvent.change(screen.getByLabelText('Recipe reference amount'), {
      target: { value: '50' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getAllByText('Quinoa').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Recipe name'), {
      target: { value: 'Quinoa bowl' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create recipe' }))
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:createRecipe',
        args: expect.objectContaining({
          ingredientLines: [
            expect.objectContaining({
              sourceType: 'ingredient',
              ingredientId: 'ingredient-2',
              expectedSnapshot: {
                name: 'Quinoa',
                kcalPer100: ingredient.kcalPer100,
                kcalBasisUnit: ingredient.kcalBasisUnit,
                ignoreCalories: ingredient.ignoreCalories,
              },
            }),
          ],
        }),
      }),
    )
  })

  it('offers only the current archived group while editing its ingredient', async () => {
    renderCatalogRoute()

    fireEvent.click(screen.getByRole('button', { name: 'New ingredient' }))
    expect(screen.getByLabelText('Ingredient group').textContent).not.toContain(
      'Legacy staples',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))

    openRecord('Millet')
    const groupSelect = screen.getByLabelText('Ingredient group')

    await waitFor(() =>
      expect(groupSelect.textContent).toContain('Legacy staples (archived)'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save ingredient' }))

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateIngredient',
        args: expect.objectContaining({
          ingredientId: ingredientWithArchivedGroup._id,
          groupId: archivedFoodGroup._id,
        }),
      }),
    )
    expect(screen.queryByLabelText('Ingredient group')).toBeNull()
  })

  it('keeps an unloaded active current group visible while editing', async () => {
    renderCatalogRoute()

    openRecord('Barley')
    const groupSelect = screen.getByLabelText('Ingredient group')

    await waitFor(() =>
      expect(groupSelect.textContent).toContain('Later-page staples'),
    )
    expect(groupSelect.textContent).not.toContain(
      'Later-page staples (archived)',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save ingredient' }))
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateIngredient',
        args: expect.objectContaining({
          ingredientId: ingredientWithUnloadedActiveGroup._id,
          groupId: unloadedActiveFoodGroup._id,
        }),
      }),
    )
  })

  it('shows and preserves a non-gram ingredient kcal basis while editing', async () => {
    renderCatalogRoute()

    expect(
      screen.getByRole('button', {
        name: /^Edit Egg .*per 100 piece 155 kcal$/,
      }),
    ).toBeTruthy()
    openRecord('Egg')

    const basisSelect = screen.getByLabelText('Ingredient kcal basis')
    expect(basisSelect.textContent).toContain('piece')
    fireEvent.click(screen.getByRole('button', { name: 'Save ingredient' }))

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateIngredient',
        args: expect.objectContaining({
          ingredientId: ingredientPerPiece._id,
          kcalBasisUnit: 'piece',
        }),
      }),
    )
  })
  it('says when an ingredient is not counted', () => {
    renderCatalogRoute()

    expect(
      screen.getByRole('button', {
        name: /^Edit Black coffee Not counted · Staples · per 100 ml 2 kcal$/,
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /^Edit Oats Mill · Staples / }),
    ).toBeTruthy()
  })

  it('edits macros per 100 and saves none while calories are ignored', async () => {
    renderCatalogRoute()

    openRecord('Oat milk')
    expect(screen.getByLabelText('Protein')).toHaveProperty('value', '1')
    fireEvent.change(screen.getByLabelText('Fat'), { target: { value: '1.2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save ingredient' }))
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateIngredient',
        args: expect.objectContaining({
          macros: { proteinG: 1, carbsG: 6.5, fatG: 1.2 },
        }),
      }),
    )

    mutationCalls.length = 0
    openRecord('Oat milk')
    fireEvent.click(screen.getByRole('switch', { name: 'Ignore calories' }))
    // The fieldset disables its fields without setting their own property.
    expect(screen.getByLabelText('Protein').matches(':disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save ingredient' }))
    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateIngredient',
        args: expect.objectContaining({ ignoreCalories: true, macros: null }),
      }),
    )
  })

  it('keeps fractional kcal/100 when an ingredient is edited', async () => {
    renderCatalogRoute()

    openRecord('Oat milk')
    fireEvent.click(screen.getByRole('button', { name: 'Save ingredient' }))

    await waitFor(() =>
      expect(mutationCalls).toContainEqual({
        name: 'nutrition:updateIngredient',
        args: expect.objectContaining({
          ingredientId: fractionalIngredient._id,
          kcalPer100: 52.5,
        }),
      }),
    )
  })
})

function paginated(
  results: unknown[],
  status: PaginationStatus,
  loadMore: ReturnType<typeof vi.fn>,
) {
  return { results, status, isLoading: false, loadMore }
}

function openRecord(name: string) {
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^Edit ${name}\\b`) }),
  )
}

function renderCatalogRoute() {
  const Component = CatalogRoute.options.component as ComponentType
  return render(<Component />)
}

type PaginationStatus =
  'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted'
