// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUsageData } from '@/testing/e2e/usage-scenario'
import { toLocalDateString } from '@/lib/nutrition'
import { UsageDashboard } from './usage-dashboard'

const { results } = vi.hoisted(() => ({
  results: new Map<string, unknown>(),
}))
vi.mock('@/components/page/settings-breadcrumbs', () => ({
  SettingsBreadcrumbs: () => null,
}))
vi.mock('convex/react', () => ({
  useQuery: (
    reference: Parameters<typeof getFunctionName>[0],
    args: unknown,
  ) => (args === 'skip' ? undefined : results.get(getFunctionName(reference))),
}))

const today = toLocalDateString(Date.now())

afterEach(() => {
  cleanup()
  results.clear()
})

describe('usage dashboard', () => {
  it('groups accounts by how they log, most at risk first', () => {
    results.set('admin:isSuperAdmin', true)
    results.set('admin:engagement', createUsageData(today))
    render(<UsageDashboard />)

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent)
    expect(headings).toEqual([
      'Slipping 1',
      'Active 2',
      'New 1',
      'Lapsed 1',
      'Never started 1',
      'How people log',
      'Foods',
      'Finished days',
    ])
    const active = screen.getByRole('region', { name: 'Active 2' })
    expect(within(active).getByText('Alex')).toBeTruthy()
    expect(
      within(active).getByText(
        /^27 of 28 days · 26 the 4 weeks before · Last logged .+ · 69% by assistant · 2 households$/,
      ),
    ).toBeTruthy()
    const never = screen.getByRole('region', { name: 'Never started 1' })
    expect(within(never).getByText('Unnamed account')).toBeTruthy()
    expect(within(never).getByText(/^Joined /)).toBeTruthy()
  })

  it('shows logging channels and food sources as shares', () => {
    results.set('admin:isSuperAdmin', true)
    results.set('admin:engagement', createUsageData(today))
    render(<UsageDashboard />)

    const how = screen.getByRole('region', { name: 'How people log' })
    const figure = (region: HTMLElement, label: string) =>
      within(region).getByText(label).nextElementSibling?.textContent
    expect(figure(how, 'Meals logged')).toBe('185')
    expect(figure(how, 'By an AI assistant')).toBe('35%')
    expect(figure(how, 'Before this was recorded')).toBe('4%')
    const foods = screen.getByRole('region', { name: 'Foods' })
    expect(figure(foods, 'From the food library')).toBe('35%')
    const days = screen.getByRole('region', { name: 'Finished days' })
    expect(figure(days, 'Within 10% of the goal')).toBe('43%')
  })

  it('says when its figures cover only part of the data', () => {
    results.set('admin:isSuperAdmin', true)
    results.set('admin:engagement', {
      ...createUsageData(today),
      partial: true,
    })
    render(<UsageDashboard />)
    expect(screen.getByRole('note').textContent).toContain(
      'some figures cover only part of it',
    )
  })

  it('looks like a missing page to everyone else', () => {
    results.set('admin:isSuperAdmin', false)
    results.set('admin:engagement', createUsageData(today))
    render(<UsageDashboard />)
    expect(screen.getByText('This page isn’t available.')).toBeTruthy()
    expect(screen.queryByText('Alex')).toBeNull()
  })

  it('waits for access before loading', () => {
    render(<UsageDashboard />)
    expect(screen.getByRole('status', { name: 'Loading usage…' })).toBeTruthy()
  })
})
