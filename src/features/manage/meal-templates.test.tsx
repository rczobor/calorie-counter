import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { update, loadMore } = vi.hoisted(() => ({
  update: vi.fn(),
  loadMore: vi.fn(),
}))
const template = {
  _id: 'template',
  name: 'Usual breakfast',
  editRevision: 0,
  items: [
    {
      sourceType: 'customByWeight',
      name: 'Oats',
      kcalPer100: 350,
      consumedWeightGrams: 50,
      servingCount: 2,
      ignoreCalories: false,
      foodIdentity: { basis: 'g', brand: 'Oat Brand' },
    },
    {
      sourceType: 'fixedCalories',
      name: 'Cookie',
      calories: 200,
      servingCount: 2,
      macros: { proteinG: 4, carbsG: 30, fatG: 8 },
      foodIdentity: { basis: 'serving', servingLabel: 'cookies' },
    },
  ],
}
vi.mock('convex/react', () => ({
  useMutation: () => update,
  usePaginatedQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => ({
    results:
      args === 'skip'
        ? []
        : getFunctionName(reference) === 'savedFoods:listTemplates'
          ? [template]
          : [
              {
                _id: 'milk',
                name: 'Milk',
                foodIdentity: { basis: 'ml', brand: 'Milk Brand' },
                nutrition: {
                  kind: 'byVolume',
                  kcalPer100: 64,
                  ignoreCalories: false,
                },
              },
            ],
    status: 'CanLoadMore',
    loadMore,
  }),
}))
import { MealTemplates } from './meal-templates'
beforeEach(() => {
  vi.clearAllMocks()
  update.mockResolvedValue({ templateId: 'template' })
})
afterEach(cleanup)

describe('meal template management', () => {
  it('renames, changes portions, and explicitly replaces a product without editing until save', async () => {
    render(<MealTemplates />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Edit Usual breakfast/ }),
    )
    fireEvent.change(screen.getByLabelText('Template name'), {
      target: { value: 'New breakfast' },
    })
    fireEvent.change(screen.getByLabelText('Quantity (cookies)'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Replace Oats'), {
      target: { value: 'milk' },
    })
    fireEvent.change(screen.getByLabelText('Quantity (ml)'), {
      target: { value: '200' },
    })
    expect(update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        input: {
          action: 'edit',
          templateId: 'template',
          expectedEditRevision: 0,
          name: 'New breakfast',
          items: [
            {
              sourceType: 'savedFood',
              savedFoodId: 'milk',
              portion: { ml: 200 },
              expectedSnapshot: {
                name: 'Milk',
                nutrition: {
                  kind: 'byVolume',
                  kcalPer100: 64,
                  ignoreCalories: false,
                },
                foodIdentity: { basis: 'ml', brand: 'Milk Brand' },
                nutritionProvenance: undefined,
              },
            },
            {
              ...template.items[1],
              calories: 100,
              servingCount: 1,
              // Whole-item macros halve with the calories.
              macros: { proteinG: 2, carbsG: 15, fatG: 4 },
            },
          ],
        },
      }),
    )
  })

  it('removes ingredients, validates quantities, paginates, and confirms deletion', async () => {
    render(<MealTemplates />)
    fireEvent.click(
      screen.getByRole('button', { name: /^Edit Usual breakfast/ }),
    )
    fireEvent.click(screen.getByLabelText('Remove Cookie'))
    fireEvent.change(screen.getByLabelText('Quantity (g)'), {
      target: { value: '0' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'Save template',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('Quantity (g)'), {
      target: { value: '75' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save template' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        input: expect.objectContaining({
          items: [
            {
              ...template.items[0],
              consumedWeightGrams: 75,
              servingCount: 3,
            },
          ],
        }),
      }),
    )
    expect(screen.queryByLabelText('Template name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more templates' }))
    expect(loadMore).toHaveBeenCalledWith(20)
    update.mockClear()
    fireEvent.click(
      screen.getByRole('button', { name: /^Edit Usual breakfast/ }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'More actions for Usual breakfast' }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete template' }),
    )
    expect(update).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        input: {
          action: 'delete',
          templateId: 'template',
          expectedEditRevision: 0,
        },
      }),
    )
  })
})
