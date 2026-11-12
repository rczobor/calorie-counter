import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { DayBar, type DayRow } from './history-chart'

afterEach(cleanup)

const day = (consumed: number, mealCount = 1): DayRow => ({
  date: '2026-04-04',
  consumed,
  goal: 2000,
  remaining: 2000 - consumed,
  mealCount,
})

// A 100px-tall column whose top is 2500 kcal, so 1 px is 25 kcal.
function drawBar(row: DayRow) {
  const { container } = render(
    <svg>
      <DayBar
        x={10}
        width={28}
        height={(row.mealCount ? row.consumed : 0) / 25}
        background={{ x: 10, y: 0, width: 28, height: 100 }}
        day={row}
        max={2500}
        clipId="bar"
      />
    </svg>,
  )
  const overage = container.querySelector('[data-overage]')
  return {
    overage: overage && Number(overage.getAttribute('height')),
    goalY: Number(container.querySelector('[data-goal]')?.getAttribute('y1')),
    empty: container.querySelector('[data-empty]') !== null,
  }
}

describe('History day bar', () => {
  it('turns only the part past the goal berry', () => {
    // 2250 of 2000: a 90px bar with its top 10px past the goal at y = 20.
    const over = drawBar(day(2250))
    expect(over.overage).toBeCloseTo(10)
    expect(over.goalY).toBeCloseTo(20)
    expect(drawBar(day(1500)).overage).toBeNull()
  })

  it('keeps a small overage visible', () => {
    expect(drawBar(day(2020)).overage).toBe(4)
  })

  it('marks the goal over a day without meals', () => {
    const empty = drawBar(day(0, 0))
    expect(empty.empty).toBe(true)
    expect(empty.overage).toBeNull()
    expect(empty.goalY).toBeCloseTo(20)
  })
})
