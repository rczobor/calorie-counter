import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../convex/_generated/dataModel'
import { shiftDate } from '@/features/weight/weight-format'
import { toLocalDateString } from '@/lib/nutrition'

const { queried, linkedPerson, weighIns, rangeEntries } = vi.hoisted(() => ({
  queried: [] as Array<{ name: string; args: unknown }>,
  linkedPerson: { current: null as unknown },
  weighIns: { current: [] as unknown[] },
  rangeEntries: { current: [] as unknown[] },
}))
const alex = {
  _id: 'aaaaaaaaaaaaaaaaaaaa' as Id<'people'>,
  _creationTime: 1,
  name: 'Alex',
  currentDailyGoalKcal: 2000,
  archived: false,
  editRevision: 0,
  createdAt: 1,
}
const sam = {
  ...alex,
  _id: 'bbbbbbbbbbbbbbbbbbbb' as Id<'people'>,
  name: 'Sam',
}

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}))
vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
// Recharts draws nothing in jsdom; the stand-in scrubs to a day and back.
vi.mock('@/features/weight/weight-chart', () => ({
  WeightChart: ({
    onScrub,
  }: {
    onScrub?: (weight: { kg: number; date: string } | null) => void
  }) => (
    <>
      <button
        type="button"
        onClick={() => onScrub?.({ kg: 83.3, date: '2026-10-27' })}
      >
        Scrub Oct 27
      </button>
      <button type="button" onClick={() => onScrub?.(null)}>
        Release
      </button>
    </>
  ),
}))
vi.mock('@/features/households/convex-hooks', () => ({
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => {
    if (args === 'skip') return undefined
    const name = getFunctionName(reference)
    queried.push({ name, args })
    // The linked person is beyond the first page and still loading.
    if (name === 'people:get') return linkedPerson.current ?? undefined
    if (name === 'weight:listRange') return rangeEntries.current
    if (name === 'weight:latestOnOrBefore')
      return rangeEntries.current.at(-1) ?? null
    return undefined
  },
  usePaginatedQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => ({
    results:
      args === 'skip'
        ? []
        : getFunctionName(reference) === 'people:list'
          ? [alex]
          : getFunctionName(reference) === 'weight:list'
            ? weighIns.current
            : [],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
  useMutation: () => vi.fn(),
}))
import { Route } from './weight'

const WeightPage = Route.options.component as ComponentType

describe('Weight page', () => {
  afterEach(() => {
    cleanup()
    queried.length = 0
    linkedPerson.current = null
    weighIns.current = []
    rangeEntries.current = []
    window.history.replaceState(null, '', '/')
  })

  it('reads the trend window before the range as well', () => {
    rangeEntries.current = [
      {
        _id: 'weight-1',
        _creationTime: 1,
        personId: alex._id,
        measuredOn: '2026-11-08',
        weightKg: 82.4,
      },
    ]
    render(<WeightPage />)
    const today = toLocalDateString(Date.now())
    const start = shiftDate(today, -89)
    const reads = queried
      .filter(({ name }) => name === 'weight:listRange')
      .map(({ args }) => args)
    // The 90-day range, and the 27 days before it the trend is fitted over.
    expect(reads).toContainEqual(
      expect.objectContaining({ startDate: start, endDate: today }),
    )
    expect(reads).toContainEqual(
      expect.objectContaining({
        startDate: shiftDate(start, -27),
        endDate: shiftDate(start, -1),
      }),
    )
  })

  it('shows a scrubbed day in the weight card, then the latest again', () => {
    const entry = (measuredOn: string, weightKg: number) => ({
      _id: `weight-${measuredOn}`,
      _creationTime: 1,
      personId: alex._id,
      measuredOn,
      weightKg,
    })
    rangeEntries.current = [
      entry('2026-08-16', 84.9),
      entry('2026-11-08', 82.4),
    ]
    weighIns.current = [...rangeEntries.current].reverse()
    render(<WeightPage />)
    const card = screen.getByRole('region', { name: 'Alex’s weight' })
    const text = () => card.textContent ?? ''

    expect(text()).toContain('82.4')
    expect(text()).toContain('−2.5')
    fireEvent.click(screen.getByRole('button', { name: 'Scrub Oct 27' }))
    expect(text()).toContain('83.3')
    expect(text()).toContain('Oct 27')
    // The change is the scrubbed day's, from the same start.
    expect(text()).toContain('−1.6')
    fireEvent.click(screen.getByRole('button', { name: 'Release' }))
    expect(text()).toContain('82.4')
    expect(text()).toContain('−2.5')
  })

  it('lists the latest ten weigh-ins until older ones are asked for', () => {
    weighIns.current = Array.from({ length: 25 }, (_, index) => ({
      _id: `weight-${index}`,
      _creationTime: 1,
      personId: alex._id,
      measuredOn: `2026-10-${String(31 - index).padStart(2, '0')}`,
      weightKg: 80 + index / 10,
    }))
    render(<WeightPage />)
    const list = () => screen.getByRole('heading', { name: 'Weigh-ins' })
    const rows = () =>
      list().closest('section')?.querySelectorAll('li').length ?? 0

    expect(rows()).toBe(10)
    fireEvent.click(
      screen.getByRole('button', { name: 'Load older weigh-ins' }),
    )
    expect(rows()).toBe(25)
    expect(
      screen.queryByRole('button', { name: 'Load older weigh-ins' }),
    ).toBeNull()
  })

  it('waits for a linked person instead of recording for the first one', () => {
    window.history.replaceState(null, '', `/weight?personId=${sam._id}`)
    const view = render(<WeightPage />)

    expect(screen.queryByRole('button', { name: /Record weight/ })).toBeNull()
    expect(queried.some(({ name }) => name.startsWith('weight:'))).toBe(false)

    linkedPerson.current = sam
    view.rerender(<WeightPage />)
    expect(screen.getByRole('button', { name: /Record weight/ })).toBeTruthy()
    expect(
      queried.filter(({ name }) => name.startsWith('weight:')),
    ).not.toContainEqual(
      expect.objectContaining({
        args: expect.objectContaining({ personId: alex._id }),
      }),
    )
  })

  it('shows another member’s person as private without reading their weight', () => {
    window.history.replaceState(null, '', `/weight?personId=${sam._id}`)
    linkedPerson.current = { ...sam, linkedAccount: 'other' }
    render(<WeightPage />)

    expect(screen.getByText('Private to Sam')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Record weight/ })).toBeNull()
    expect(queried.some(({ name }) => name.startsWith('weight:'))).toBe(false)
    expect(queried.some(({ name }) => name === 'energy:checkIn')).toBe(false)
  })
})
