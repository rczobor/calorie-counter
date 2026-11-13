import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import { GoalHistorySheet } from './goal-history-sheet'

// Server order: newest date first, newest change first within a date.
const goals = [
  { _id: 'g3', effectiveDate: '2026-11-13', goalKcal: 2000, createdAt: 3 },
  {
    _id: 'g2',
    effectiveDate: '2026-11-13',
    goalKcal: 2020,
    reason: 'Calculator: lose 1% a week',
    createdAt: 2,
  },
  {
    _id: 'g1',
    effectiveDate: '2026-03-15',
    goalKcal: 2000,
    reason: 'Initial goal',
    createdAt: 1,
  },
]
vi.mock('@/features/households/convex-hooks', () => ({
  usePaginatedQuery: () => ({
    results: goals,
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))
afterEach(cleanup)

describe('GoalHistorySheet', () => {
  it('folds a same-day change under the goal that applied', () => {
    render(
      <GoalHistorySheet
        personId={'person-alex' as Id<'people'>}
        onClose={vi.fn()}
      />,
    )
    const list = screen.getByRole('list', { name: 'Goal history' })
    expect(list.children).toHaveLength(2)
    expect(screen.getByText('Initial goal')).toBeTruthy()
    expect(screen.queryByText('Calculator: lose 1% a week')).toBeNull()

    const day = screen.getByRole('button', {
      name: /Replaced 1 earlier goal that day/,
    })
    expect(day.textContent).toContain('2000')
    fireEvent.click(day)
    expect(day.getAttribute('aria-expanded')).toBe('true')
    expect(list.children).toHaveLength(3)
    expect(screen.getByText('Calculator: lose 1% a week')).toBeTruthy()
    expect(screen.getByText(/^Replaced · set at /)).toBeTruthy()
  })
})
