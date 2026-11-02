import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { update, confirm } = vi.hoisted(() => ({
  update: vi.fn(),
  confirm: vi.fn(),
}))
const defaults = {
  householdId: 'home',
  personId: 'alex',
  timeZone: 'Europe/Budapest',
  confirmationMode: 'always' as 'always' | 'explicitOnly',
  householdName: 'Home',
  personName: 'Alex',
  available: true,
}
let preferences: typeof defaults | null | undefined = defaults
vi.mock('convex/react', () => ({
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => {
    const name = getFunctionName(reference)
    if (args === 'skip') return undefined
    if (name === 'mcpPreferences:get') return preferences
    if (name === 'households:list') return [{ _id: 'home', name: 'Home' }]
    return null
  },
  useMutation: () => update,
  usePaginatedQuery: (_reference: unknown, args: unknown) => ({
    results:
      args === 'skip' ? [] : [{ _id: 'alex', name: 'Alex', archived: false }],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({
    ariaLabel,
    value,
    options,
    onValueChange,
  }: {
    ariaLabel: string
    value?: string | null
    options: Array<{ value: string; label: string }>
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option value="">Choose</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))
vi.mock('@/hooks/use-confirmable-action', () => ({
  useConfirmableAction: () => ({
    isRunning: false,
    isConfirmDialogOpen: false,
    handleConfirmDialogOpenChange: vi.fn(),
    confirmPendingAction: vi.fn(),
    confirmAndRunAction: confirm,
    runAction: async (_label: string, action: () => Promise<unknown>) =>
      action(),
  }),
}))
import { LoggingPreferences } from './logging-preferences'
beforeEach(() => {
  vi.clearAllMocks()
  preferences = { ...defaults }
  update.mockResolvedValue(null)
})
afterEach(cleanup)

describe('Logging preferences', () => {
  it('shows saved account defaults and distinguishes them from browser selection', () => {
    render(<LoggingPreferences />)
    expect(screen.getByText('Europe/Budapest')).toBeTruthy()
    expect(screen.getByText('Ask before saving')).toBeTruthy()
    expect(
      screen.getByText(
        /Browsing another person or household here does not change them/,
      ),
    ).toBeTruthy()
  })
  it('reviews reset before clearing defaults and keeps nutrition records untouched', async () => {
    render(<LoggingPreferences />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset defaults' }))
    expect(update).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('Recorded meals and connections remain'),
      expect.any(String),
      expect.any(Function),
    )
    await act(async () => confirm.mock.calls[0][2]())
    expect(update).toHaveBeenCalledWith({ preferences: null })
  })
  it('requires explicit review before enabling direct exact-meal logging', async () => {
    render(<LoggingPreferences />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit defaults' }))
    fireEvent.change(screen.getByLabelText('Logging save policy'), {
      target: { value: 'explicitOnly' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save defaults' }))
    expect(update).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining(
        'Estimates, cooking, corrections, and transfers still require review',
      ),
      expect.any(String),
      expect.any(Function),
    )
    await act(async () => confirm.mock.calls[0][2]())
    expect(update).toHaveBeenCalledWith({
      preferences: expect.objectContaining({
        householdId: 'home',
        personId: 'alex',
        confirmationMode: 'explicitOnly',
      }),
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Save defaults' }),
      ).toBeNull(),
    )
  })
  it('does not silently replace unavailable defaults and supports explicit new selection', () => {
    preferences = {
      ...defaults,
      householdId: 'removed-household',
      available: false,
    }
    render(<LoggingPreferences />)
    expect(screen.getByRole('alert').textContent).toContain(
      'will not silently select another household',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit defaults' }))
    expect(
      (screen.getByLabelText('Logging household') as HTMLSelectElement).value,
    ).toBe('')
    expect(
      (
        screen.getByRole('button', {
          name: 'Save defaults',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText('Logging household'), {
      target: { value: 'home' },
    })
    fireEvent.change(screen.getByLabelText('Logging person'), {
      target: { value: 'alex' },
    })
    expect(
      (
        screen.getByRole('button', {
          name: 'Save defaults',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false)
  })
  it('allows setting defaults from the empty state and cancelling without saving', () => {
    preferences = null
    render(<LoggingPreferences />)
    expect(screen.getByText(/No defaults saved/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Set defaults' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(update).not.toHaveBeenCalled()
  })
})
