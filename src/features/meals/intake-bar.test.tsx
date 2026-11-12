import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IntakeBar, intakeBarGeometry } from './intake-bar'

afterEach(cleanup)

const tickAt = (consumed: number, goal: number) => {
  const bar = intakeBarGeometry(consumed, goal)
  return bar.over ? bar.tick : undefined
}

describe('day summary bar', () => {
  it('fills toward the goal up to and at the goal, without a tick', () => {
    expect(intakeBarGeometry(1199, 2000)).toEqual({
      over: false,
      fill: 59.95,
    })
    expect(intakeBarGeometry(2000, 2000)).toEqual({ over: false, fill: 100 })
    expect(intakeBarGeometry(0, 0)).toEqual({ over: false, fill: 0 })
  })

  it('scales to what was logged over the goal and ticks the goal', () => {
    // Slightly over: the tick sits near the end, leaving a short overage.
    expect(tickAt(2127, 2000)).toBeCloseTo(94.03, 2)
    // Far over: the goal is two thirds of the way along.
    expect(tickAt(3000, 2000)).toBeCloseTo(66.67, 2)
    // No goal: everything logged is overage.
    expect(intakeBarGeometry(150, 0)).toEqual({ over: true, tick: 0 })
  })

  it('ticks the goal and turns only the overage berry when over', () => {
    const over = render(<IntakeBar consumed={2500} goal={2000} />)
    const tick = over.container.querySelector<HTMLElement>('[data-goal-tick]')
    expect(tick?.style.left).toBe('80%')
    // Up to the goal stays the left colour; only the overage is berry.
    const base = over.container.querySelector<HTMLElement>('.bg-kcal-left-bar')
    expect(base?.style.width).toBe('80%')
    expect(over.container.querySelector('[data-overage]')?.classList).toContain(
      'bg-kcal-over-bar',
    )
    over.unmount()
    // A small overage keeps a visible segment; its tick stays honest.
    const slightly = render(<IntakeBar consumed={2020} goal={2000} />)
    expect(
      slightly.container.querySelector('[data-overage]')?.classList,
    ).toContain('min-w-1.5')
    // jsdom rounds the serialised percentage, so compare the number.
    expect(
      parseFloat(
        slightly.container.querySelector<HTMLElement>('[data-goal-tick]')?.style
          .left ?? '',
      ),
    ).toBeCloseTo((2000 / 2020) * 100, 3)
    slightly.unmount()
    const under = render(<IntakeBar consumed={1500} goal={2000} />)
    expect(under.container.querySelector('[data-goal-tick]')).toBeNull()
    expect(under.container.querySelector('.bg-kcal-over-bar')).toBeNull()
  })
})
