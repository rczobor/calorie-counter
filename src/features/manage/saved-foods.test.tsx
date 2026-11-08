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
const fixedPortion = { kind: 'fixedCalories', calories: 14 }
let nutrition: Record<string, unknown> = fixedPortion
const food = {
  _id: 'vitamins',
  name: 'Vitamins',
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
          nutrition,
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
import { applySavedLocale } from '@/i18n/locale'
beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  nutrition = fixedPortion
  archive.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  applySavedLocale(null)
})

describe('Reusable food library', () => {
  it('explains the stored portion and nutrition source without a nutrition editor', () => {
    render(<SavedFoods showArchived={false} onShowArchivedChange={vi.fn()} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Vitamins 14 kcal / saved portion' }),
    )
    expect(screen.getByText(/entire originally logged item/)).toBeTruthy()
    expect(screen.getByText('Nutrition source')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })
  it('names the per-100 g basis of a by-weight food in its sheet', () => {
    nutrition = { kind: 'byWeight', kcalPer100: 250 }
    render(<SavedFoods showArchived={false} onShowArchivedChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Vitamins/ }))
    expect(screen.getByText('kcal per 100 g')).toBeTruthy()
  })
  it('archives or restores the selected reusable food and keeps pagination explicit', async () => {
    render(<SavedFoods showArchived onShowArchivedChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Vitamins/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() =>
      expect(archive).toHaveBeenCalledWith({
        foodId: 'vitamins',
        archived: true,
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: /^Older vitamins Archived/ }),
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
  it('writes recorded decimals the Hungarian way', () => {
    applySavedLocale('hu')
    nutrition = { kind: 'byVolume', kcalPer100: 52.5 }
    render(<SavedFoods showArchived={false} onShowArchivedChange={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Vitamins / 100 ml 52,5 kcal' }),
    ).toBeTruthy()
  })
})
