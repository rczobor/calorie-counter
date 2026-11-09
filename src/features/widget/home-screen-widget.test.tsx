// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomeScreenWidget } from './home-screen-widget'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('convex/react', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'meals:getDayNutrition'
      ? { remainingCalories: -120, goalKcal: 2000 }
      : [{ id: 'widget-1', person: 'Sam', createdAt: 0 }],
  useMutation: () => create,
  usePaginatedQuery: () => ({
    results: [{ _id: 'alex', name: 'Alex' }],
    status: 'Exhausted',
    loadMore: vi.fn(),
  }),
}))
vi.mock('@/features/households/household-context', () => ({
  useHousehold: () => ({ householdId: 'home' }),
}))
vi.mock('@/components/page/settings-breadcrumbs', () => ({
  SettingsBreadcrumbs: () => null,
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({
    ariaLabel,
    options,
    onValueChange,
  }: {
    ariaLabel: string
    options: Array<{ value: string; label: string }>
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label={ariaLabel}
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
afterEach(cleanup)

describe('Home Screen widget settings', () => {
  it('creates a widget for the chosen person and shows its script once', async () => {
    create.mockResolvedValue({
      id: 'widget-2',
      token: 'ccw_secret',
      url: 'https://example.convex.site/widget/today',
    })
    render(<HomeScreenWidget />)
    expect(screen.getByText('Sam')).toBeTruthy()
    // The preview shows the first person before anyone is picked.
    expect(
      screen.getByRole('img', { name: /Widget preview: Alex/ }).textContent,
    ).toContain('120kcal over')

    fireEvent.change(screen.getByLabelText(/Switch person/), {
      target: { value: 'alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create widget' }))

    const script = (await screen.findByLabelText(
      'Widget script',
    )) as HTMLTextAreaElement
    expect(create).toHaveBeenCalledWith({
      householdId: 'home',
      personId: 'alex',
    })
    expect(script.value).toContain('const TOKEN = "ccw_secret"')
    expect(script.value).toContain(
      'const ENDPOINT = "https://example.convex.site/widget/today"',
    )

    // Closing before copying asks first: the script is shown only once.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByText('Close without copying?')).toBeTruthy()
  })

  it('closes straight away once the script is copied', async () => {
    create.mockResolvedValue({
      id: 'widget-2',
      token: 'ccw_secret',
      url: 'https://example.convex.site/widget/today',
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<HomeScreenWidget />)
    fireEvent.change(screen.getByLabelText(/Switch person/), {
      target: { value: 'alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create widget' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy script' }))

    await screen.findByRole('button', { name: 'Copy again' })
    // Controls to tap in other apps render as key tokens.
    expect(screen.getByText('Edit Widget').tagName).toBe('KBD')
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('const TOKEN = "ccw_secret"'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('Close without copying?')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy again' })).toBeNull()
  })
})
