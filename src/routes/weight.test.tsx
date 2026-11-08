import { cleanup, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import type { ComponentType, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Id } from '../../convex/_generated/dataModel'

const { queried, linkedPerson } = vi.hoisted(() => ({
  queried: [] as Array<{ name: string; args: unknown }>,
  linkedPerson: { current: null as unknown },
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
    if (name === 'weight:listRange') return []
    if (name === 'weight:latestOnOrBefore') return null
    return undefined
  },
  usePaginatedQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => ({
    results:
      args !== 'skip' && getFunctionName(reference) === 'people:list'
        ? [alex]
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
    window.history.replaceState(null, '', '/')
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
})
