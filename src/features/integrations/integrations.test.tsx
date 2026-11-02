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
import { ConnectionConsent } from './connection-consent'
import { ConnectedAgents } from './connected-agents'

const { query, authorize, revoke } = vi.hoisted(() => ({
  query: vi.fn(),
  authorize: vi.fn(),
  revoke: vi.fn(),
}))
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
vi.mock('./logging-preferences', () => ({ LoggingPreferences: () => null }))
vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => query(...args),
  useAction: () => authorize,
  useMutation: () => revoke,
}))
beforeEach(() => {
  vi.resetAllMocks()
})
afterEach(cleanup)

describe('MCP connection UI', () => {
  it('shows unverified client identity, redirect and scopes, and approves only on a user click', async () => {
    query.mockReturnValue({
      status: 'pending',
      kind: 'redirect',
      clientName: 'ChatGPT',
      redirectUri: 'https://chatgpt.com/callback',
      scopes: [
        { name: 'nutrition:read', description: 'Read your nutrition data' },
      ],
    })
    authorize.mockResolvedValue({ redirectUrl: null })
    render(<ConnectionConsent requestId="request-1" />)
    expect(screen.getByText(/Client name \(unverified\)/)).toBeTruthy()
    expect(screen.getByText('chatgpt.com')).toBeTruthy()
    expect(screen.getByText('Read your nutrition data')).toBeTruthy()
    expect(authorize).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }))
    await waitFor(() =>
      expect(authorize).toHaveBeenCalledWith({
        requestId: 'request-1',
        approve: true,
      }),
    )
    expect(
      await screen.findByText('You can return to your assistant.'),
    ).toBeTruthy()
  })

  it('supports denial and displays an expired authorization error without losing the choice', async () => {
    query.mockReturnValue({
      status: 'pending',
      kind: 'redirect',
      clientName: 'Unknown client',
      redirectUri: 'https://chatgpt.com/callback',
      scopes: [],
    })
    authorize.mockRejectedValue(new Error('This request has expired.'))
    render(<ConnectionConsent requestId="request-2" />)
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'This request has expired.',
    )
    expect(authorize).toHaveBeenCalledWith({
      requestId: 'request-2',
      approve: false,
    })
    expect(
      (screen.getByRole('button', { name: 'Deny' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })

  it('shows an invalid request state without offering approval', () => {
    query.mockReturnValue(null)
    render(<ConnectionConsent requestId="expired" />)
    expect(screen.getByText(/expired or was already handled/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Allow access' })).toBeNull()
    expect(authorize).not.toHaveBeenCalled()
  })

  it('disconnects the selected connection and exposes recoverable errors', async () => {
    query.mockImplementation((reference) =>
      getFunctionName(reference) === 'mcp:getConfiguration'
        ? { enabled: true, url: 'https://example.convex.site/mcp' }
        : [
            {
              id: 'connection-1',
              name: 'My assistant',
              scopes: ['nutrition:read'],
            },
          ],
    )
    revoke.mockRejectedValue(new Error('Try again later.'))
    render(<ConnectedAgents />)
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Try again later.',
    )
    expect(revoke).toHaveBeenCalledWith({ id: 'connection-1' })
    expect(
      (screen.getByRole('button', { name: 'Disconnect' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false)
  })
})
