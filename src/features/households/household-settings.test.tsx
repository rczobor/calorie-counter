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
import { HouseholdSettings } from './household-settings'

const { query, rename, invite, accept, revoke, updateMember, selectHousehold } =
  vi.hoisted(() => ({
    query: vi.fn(),
    rename: vi.fn(),
    invite: vi.fn(),
    accept: vi.fn(),
    revoke: vi.fn(),
    updateMember: vi.fn(),
    selectHousehold: vi.fn(),
  }))
vi.mock('./household-context', () => ({
  useHousehold: () => ({ householdId: 'home', selectHousehold }),
}))
vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => query(...args),
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    ({
      'households:rename': rename,
      'households:invite': invite,
      'households:acceptInvitation': accept,
      'households:revokeInvitation': revoke,
      'households:updateMember': updateMember,
    })[getFunctionName(reference)],
}))
let role = 'admin'
let invitation: { householdId: string; name: string } | null = null
beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/household')
  role = 'admin'
  invitation = null
  query.mockImplementation((reference) => {
    switch (getFunctionName(reference)) {
      case 'households:list':
        return [{ _id: 'home', name: 'Home', role }]
      case 'households:members':
        return [{ _id: 'me', name: 'Robi', role, isYou: true }]
      case 'households:invitations':
        return [{ _id: 'invite', expiresAt: Date.now() + 100000 }]
      case 'households:inspectInvitation':
        return invitation
    }
  })
  rename.mockResolvedValue(null)
  invite.mockResolvedValue('secret-token')
  accept.mockResolvedValue('shared-home')
  revoke.mockResolvedValue(null)
  updateMember.mockResolvedValue(null)
})
afterEach(cleanup)

describe('household settings', () => {
  it('lets admins rename the household and create a copyable invitation without sending it', async () => {
    render(<HouseholdSettings />)
    fireEvent.change(screen.getByLabelText('Household name'), {
      target: { value: 'Robi and Viki' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() =>
      expect(rename).toHaveBeenCalledWith({
        householdId: 'home',
        name: 'Robi and Viki',
      }),
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Create invitation link' }),
    )
    expect(await screen.findByLabelText('Invitation link')).toHaveProperty(
      'value',
      `${window.location.origin}/household#invite=secret-token`,
    )
    expect(screen.getByText(/Anyone with the link/)).toBeTruthy()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/household#invite=secret-token`,
      ),
    )
  })

  it('discloses shared history and waits for an explicit join before accepting', async () => {
    window.history.replaceState(null, '', '/household#invite=join-token')
    invitation = { householdId: 'shared-home', name: 'Shared home' }
    render(<HouseholdSettings />)
    expect(screen.getByText(/everyone’s past meals and goals/)).toBeTruthy()
    expect(accept).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Join household' }))
    await waitFor(() =>
      expect(accept).toHaveBeenCalledWith({ token: 'join-token' }),
    )
    await waitFor(() =>
      expect(selectHousehold).toHaveBeenCalledWith('shared-home'),
    )
    expect(window.location.hash).toBe('')
  })

  it('shows expired invitations without a join action', () => {
    window.history.replaceState(null, '', '/household#invite=expired')
    render(<HouseholdSettings />)
    expect(screen.getByText(/expired, was revoked/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Join household' })).toBeNull()
  })

  it('hides admin controls for members and confirms leaving', async () => {
    role = 'member'
    render(<HouseholdSettings />)
    expect(
      screen.queryByRole('button', { name: 'Create invitation link' }),
    ).toBeNull()
    expect(screen.queryByRole('button', { name: 'Make admin' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Leave household' }))
    expect(updateMember).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' }),
    )
    await waitFor(() =>
      expect(updateMember).toHaveBeenCalledWith({
        householdId: 'home',
        memberId: 'me',
        role: 'remove',
      }),
    )
  })

  it('shows actionable membership errors without deleting history', async () => {
    updateMember.mockRejectedValue(new Error('Promote another admin first.'))
    render(<HouseholdSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Make member' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' }),
    )
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Promote another admin first.',
    )
  })

  it('revokes only the invitation selected by the admin', async () => {
    render(<HouseholdSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Revoke invitation' }))
    await waitFor(() =>
      expect(revoke).toHaveBeenCalledWith({
        householdId: 'home',
        invitationId: 'invite',
      }),
    )
  })
})
