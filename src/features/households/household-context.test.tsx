// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { useState } from 'react'
import { renderToString } from 'react-dom/server'
import { HouseholdProvider, useHousehold } from './household-context'
import {
  DraftPersistenceIdentityProvider,
  useDraftPersistenceIdentity,
} from '../cooking/draft-persistence-identity'
import {
  useQuery,
  useMutation,
  usePaginatedQuery,
  useConvex,
} from './convex-hooks'
import { api } from '../../../convex/_generated/api'
import { asId } from '@/tests/factories'

const { query, mutation, paginated, clientQuery } = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  paginated: vi.fn(),
  clientQuery: vi.fn(),
}))
vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => query(...args),
  useMutation: () => mutation,
  usePaginatedQuery: (...args: unknown[]) => paginated(...args),
  useConvex: () => ({ query: clientQuery }),
}))
const first = asId<'households'>('household-a')
const second = asId<'households'>('household-b')
let households = [
  { _id: first, name: 'Home', role: 'admin' },
  { _id: second, name: 'Other home', role: 'member' },
]

function Probe() {
  const { householdId, selectHousehold } = useHousehold()
  const identity = useDraftPersistenceIdentity()
  const [draft, setDraft] = useState('')
  useQuery(api.people.search, { archived: false, search: '' })
  useQuery(api.people.search, 'skip')
  usePaginatedQuery(
    api.people.list,
    { archived: false },
    { initialNumItems: 20 },
  )
  const save = useMutation(api.nutrition.createPerson)
  const client = useConvex()
  return (
    <>
      <p>{householdId}</p>
      <p>{identity.userId}</p>
      <input
        aria-label="Draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button onClick={() => selectHousehold?.(second)}>Switch home</button>
      <button
        onClick={() =>
          void save({
            name: 'Viki',
            currentDailyGoalKcal: 2000,
            effectiveDate: '2026-10-31',
          })
        }
      >
        Save person
      </button>
      <button
        onClick={() =>
          void client.query(api.people.search, {
            archived: false,
            search: 'Viki',
          })
        }
      >
        Read person
      </button>
    </>
  )
}
function mount(userId = 'robi') {
  return render(
    <DraftPersistenceIdentityProvider value={{ isLoaded: true, userId }}>
      <HouseholdProvider>
        <Probe />
      </HouseholdProvider>
    </DraftPersistenceIdentityProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  households = [
    { _id: first, name: 'Home', role: 'admin' },
    { _id: second, name: 'Other home', role: 'member' },
  ]
  query.mockImplementation((reference) =>
    getFunctionName(reference) === 'households:list' ? households : [],
  )
  mutation.mockResolvedValue(first)
})
afterEach(cleanup)

describe('device household selection', () => {
  it('keeps account settings accessible without an available selected household', async () => {
    households = []
    render(
      <DraftPersistenceIdentityProvider
        value={{ isLoaded: true, userId: 'robi' }}
      >
        <HouseholdProvider accountPage>
          <p>Account connection controls</p>
        </HouseholdProvider>
      </DraftPersistenceIdentityProvider>,
    )
    expect(await screen.findByText('Account connection controls')).toBeTruthy()
    expect(
      query.mock.calls.map(([reference]) => getFunctionName(reference)),
    ).not.toContain('people:search')
  })
  it('renders the application shell without browser globals during SSR', () => {
    vi.stubGlobal('window', undefined)
    try {
      const html = renderToString(
        <DraftPersistenceIdentityProvider
          value={{ isLoaded: true, userId: 'robi' }}
        >
          <HouseholdProvider>
            <Probe />
          </HouseholdProvider>
        </DraftPersistenceIdentityProvider>,
      )
      expect(html).toContain('Preparing your household')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('persists selection per account and remounts household-scoped draft identity', async () => {
    const view = mount()
    await screen.findByText('robi:household-a')
    expect(screen.queryByRole('combobox', { name: 'Household' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Manage household' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Draft'), {
      target: { value: 'Unsaved home draft' },
    })
    fireEvent.click(screen.getByText('Switch home'))
    expect(screen.getByText('robi:household-b')).toBeTruthy()
    expect(screen.getByLabelText('Draft')).toHaveProperty('value', '')
    expect(window.localStorage.getItem('calorie-counter:household:robi')).toBe(
      second,
    )
    view.unmount()
    const restored = mount()
    await screen.findByText('robi:household-b')
    restored.unmount()
    mount('viki')
    await screen.findByText('viki:household-a')
  })

  it('attaches the selected household to queries, pagination, writes, and imperative reads', async () => {
    window.localStorage.setItem('calorie-counter:household:robi', second)
    mount()
    await screen.findByText('robi:household-b')
    expect(query).toHaveBeenCalledWith(api.people.search, {
      householdId: second,
      archived: false,
      search: '',
    })
    expect(query).toHaveBeenCalledWith(api.people.search, 'skip')
    expect(paginated).toHaveBeenCalledWith(
      api.people.list,
      { householdId: second, archived: false },
      { initialNumItems: 20 },
    )
    fireEvent.click(screen.getByText('Save person'))
    expect(mutation).toHaveBeenCalledWith(
      expect.objectContaining({ householdId: second, name: 'Viki' }),
    )
    fireEvent.click(screen.getByText('Read person'))
    expect(clientQuery).toHaveBeenCalledWith(api.people.search, {
      householdId: second,
      archived: false,
      search: 'Viki',
    })
  })

  it('does not silently switch households when the default membership is revoked mid-session', async () => {
    const view = mount()
    await screen.findByText('robi:household-a')
    households = households.filter((row) => row._id !== first)
    view.rerender(
      <DraftPersistenceIdentityProvider
        value={{ isLoaded: true, userId: 'robi' }}
      >
        <HouseholdProvider>
          <Probe />
        </HouseholdProvider>
      </DraftPersistenceIdentityProvider>,
    )
    expect(
      await screen.findByText(/selected household is no longer available/),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Draft')).toBeNull()
  })

  it('lets an account with no memberships recover through an invitation without mounting unscoped features', async () => {
    households = []
    window.history.replaceState(null, '', '/household')
    query.mockImplementation((reference) => {
      if (getFunctionName(reference) === 'households:list') return households
      if (getFunctionName(reference) === 'households:inspectInvitation')
        return { householdId: second, name: 'Other home' }
      return []
    })
    mutation.mockImplementation((args: { token?: string }) => {
      if (args.token) {
        households = [{ _id: second, name: 'Other home', role: 'member' }]
        return Promise.resolve(second)
      }
      return Promise.resolve(first)
    })
    mount()
    expect(
      await screen.findByText(/no longer belong to any households/),
    ).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Household' })).toBeNull()
    expect(screen.queryByLabelText('Draft')).toBeNull()
    expect(
      query.mock.calls.map(([reference]) => getFunctionName(reference)),
    ).not.toContain('people:search')
    window.history.replaceState(null, '', '/household#invite=return-token')
    fireEvent(window, new HashChangeEvent('hashchange'))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Join household' }),
    )
    await screen.findByText('robi:household-b')
    expect(mutation).toHaveBeenCalledWith({ token: 'return-token' })
    expect(window.location.hash).toBe('')
    expect(window.localStorage.getItem('calorie-counter:household:robi')).toBe(
      second,
    )
  })

  it('explains recovery when no household or invitation is available', async () => {
    households = []
    mount()
    expect(
      await screen.findByText(/Ask a household admin for an invitation link/),
    ).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Household' })).toBeNull()
    expect(screen.queryByLabelText('Draft')).toBeNull()
  })

  it('requires a new selection when saved membership is unavailable', async () => {
    window.localStorage.setItem(
      'calorie-counter:household:robi',
      'removed-household',
    )
    mount()
    expect(
      await screen.findByText(/selected household is no longer available/),
    ).toBeTruthy()
    expect(screen.queryByLabelText('Draft')).toBeNull()
  })

  it('honors household deep links and clears linked person context on a manual switch', async () => {
    window.history.replaceState(
      null,
      '',
      `/?householdId=${second}&personId=linked-person`,
    )
    mount()
    await screen.findByText('robi:household-b')
    fireEvent.click(screen.getByText('Switch home'))
    expect(window.location.search).toBe('')
  })

  it('exposes bootstrap failures with a retry instead of mounting unscoped features', async () => {
    mutation.mockRejectedValue(new Error('Migration unavailable'))
    mount()
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining('Migration unavailable'),
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(screen.queryByLabelText('Draft')).toBeNull()
  })

  it('continues when local storage is blocked', async () => {
    const get = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    const set = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    try {
      mount()
      await screen.findByText('robi:household-a')
      fireEvent.click(screen.getByText('Switch home'))
      await waitFor(() =>
        expect(screen.getByText('robi:household-b')).toBeTruthy(),
      )
    } finally {
      get.mockRestore()
      set.mockRestore()
    }
  })
})
