import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { archive, loadMore } = vi.hoisted(() => ({
  archive: vi.fn(),
  loadMore: vi.fn(),
}))
const food = {
  _id: 'vitamins',
  name: 'Vitamins',
  nutrition: { kind: 'fixedCalories', calories: 14 },
  nutritionProvenance: {
    kind: 'provided',
    source: 'Label',
    assumptions: 'One tablet',
  },
}
const calls: Array<{ archived: boolean; search?: string }> = []
vi.mock('convex/react', () => ({
  useMutation: () => archive,
  usePaginatedQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: { archived: boolean; search?: string } | 'skip',
  ) => {
    expect(getFunctionName(reference)).toBe('savedFoods:list')
    if (args === 'skip') return { results: [], status: 'Exhausted', loadMore }
    calls.push(args)
    return {
      results: [
        {
          ...food,
          _id: args.archived ? 'archived-vitamins' : food._id,
          name: args.archived ? 'Older vitamins' : food.name,
          archivedAt: args.archived ? 10 : undefined,
        },
      ],
      status: 'CanLoadMore',
      loadMore,
    }
  },
}))
import { SavedFoods } from './saved-foods'
beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  archive.mockResolvedValue(null)
})
afterEach(cleanup)

describe('Reusable food library', () => {
  it('explains the stored portion and nutrition source without a nutrition editor', () => {
    render(<SavedFoods showArchived={false} />)
    expect(screen.getByText('14 kcal / saved portion')).toBeTruthy()
    fireEvent.click(screen.getByText('Vitamins', { selector: 'summary' }))
    expect(screen.getByText(/entire originally logged item/)).toBeTruthy()
    expect(screen.getByText('Nutrition source')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
  it('archives or restores the selected reusable food and keeps pagination explicit', async () => {
    render(<SavedFoods showArchived />)
    fireEvent.click(screen.getByText('Vitamins', { selector: 'summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() =>
      expect(archive).toHaveBeenCalledWith({
        foodId: 'vitamins',
        archived: true,
      }),
    )
    fireEvent.click(
      screen.getByText('Older vitamins · Archived', { selector: 'summary' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(archive).toHaveBeenCalledWith({
        foodId: 'archived-vitamins',
        archived: false,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Load more reusable foods' }),
    )
    expect(loadMore).toHaveBeenCalledWith(20)
    fireEvent.change(screen.getByLabelText('Search reusable foods'), {
      target: { value: '  vitamins  ' },
    })
    expect(calls).toContainEqual({ archived: false, search: 'vitamins' })
  })
})
