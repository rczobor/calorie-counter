import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import type { WeightEntry } from './record-weight-dialog'
import { WeightChart } from './weight-chart'

const entry = (measuredOn: string, weightKg: number): WeightEntry => ({
  _id: `weight-${measuredOn}` as Id<'weightEntries'>,
  personId: 'person-alex' as Id<'people'>,
  measuredOn,
  weightKg,
  editRevision: 0,
})

function lines(container: HTMLElement) {
  return [...container.querySelectorAll('polyline')].map((line) => ({
    points: line.getAttribute('points')?.split(' ').length,
    dashed: line.hasAttribute('stroke-dasharray'),
  }))
}

describe('WeightChart', () => {
  afterEach(cleanup)

  it('draws a pause longer than a week as a dashed gap and says so', () => {
    const { container } = render(
      <WeightChart
        entries={[
          entry('2026-10-01', 84),
          entry('2026-10-03', 83.8),
          entry('2026-10-20', 83.1),
          entry('2026-10-21', 83),
        ]}
        endDate="2026-10-21"
        today="2026-10-21"
      />,
    )

    expect(lines(container)).toEqual([
      { points: 2, dashed: true },
      { points: 2, dashed: false },
      { points: 2, dashed: false },
    ])
    expect(
      screen.getByRole('img', {
        name: 'Weight from 84.0 kg on Oct 1, 2026 to 83.0 kg on Oct 21, 2026, 4 weigh-ins. Dashed where there were no weigh-ins for over a week.',
      }),
    ).toBeTruthy()
  })

  it('keeps weekly weigh-ins as one line', () => {
    const { container } = render(
      <WeightChart
        entries={[
          entry('2026-10-07', 84),
          entry('2026-10-14', 83.6),
          entry('2026-10-21', 83.2),
        ]}
        endDate="2026-10-21"
        today="2026-10-21"
      />,
    )

    expect(lines(container)).toEqual([{ points: 3, dashed: false }])
    expect(screen.queryByText(/Dashed/)).toBeNull()
  })
})
