import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Id } from '../../../convex/_generated/dataModel'
import type { WeightEntry } from './record-weight-dialog'
import { splitRuns, WeightChart } from './weight-chart'

const entry = (measuredOn: string, weightKg: number): WeightEntry => ({
  _id: `weight-${measuredOn}` as Id<'weightEntries'>,
  personId: 'person-alex' as Id<'people'>,
  measuredOn,
  weightKg,
  editRevision: 0,
})

describe('WeightChart', () => {
  afterEach(cleanup)

  it('splits a pause longer than a week into a gap and says so', () => {
    const entries = [
      entry('2026-10-01', 84),
      entry('2026-10-03', 83.8),
      entry('2026-10-20', 83.1),
      entry('2026-10-21', 83),
    ]
    const { runs, gaps } = splitRuns(entries)
    expect(runs.map((run) => run.length)).toEqual([2, 2])
    expect(gaps).toEqual([[entries[1], entries[2]]])

    render(
      <WeightChart entries={entries} endDate="2026-10-21" today="2026-10-21" />,
    )
    expect(
      screen.getByText(
        'Weight from 84.0 kg on Oct 1, 2026 to 83.0 kg on Oct 21, 2026, 4 weigh-ins. Dashed where there were no weigh-ins for over a week.',
      ),
    ).toBeTruthy()
    expect(screen.getByText('No weigh-ins for over a week')).toBeTruthy()
  })

  it('keeps weekly weigh-ins as one line', () => {
    const entries = [
      entry('2026-10-07', 84),
      entry('2026-10-14', 83.6),
      entry('2026-10-21', 83.2),
    ]
    expect(splitRuns(entries)).toEqual({ runs: [entries], gaps: [] })

    render(
      <WeightChart entries={entries} endDate="2026-10-21" today="2026-10-21" />,
    )
    expect(screen.queryByText(/Dashed/)).toBeNull()
  })
})
