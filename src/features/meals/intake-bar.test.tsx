import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IntakeBar, intakeBarGeometry, intakeBarSegments } from './intake-bar'

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

  it('splits the bar into the meals, and the meal that crossed the goal at the goal', () => {
    // Yesterday's five meals, oldest first, 127 over a goal of 2000.
    const segments = intakeBarSegments([515, 550, 112, 700, 250], 2127, 2000)
    expect(segments.map((segment) => segment.meal)).toEqual([0, 1, 2, 3, 4])
    expect(segments[0].width).toBeCloseTo((515 / 2127) * 100, 5)
    expect(segments.slice(0, 4).every((segment) => segment.over === 0)).toBe(
      true,
    )
    // The extra portion starts 123 short of the goal and ends 127 past it.
    expect(segments[4]).toMatchObject({ left: 123, over: 127 })
    // Under the goal the bar is the goal, so the meals leave the rest empty.
    expect(
      intakeBarSegments([454, 130, 615], 1199, 2000).map(
        (segment) => segment.width,
      ),
    ).toEqual([22.7, 6.5, 30.75])
    // Meals still to load lead as one stretch that belongs to no meal, and
    // a meal without calories takes no room.
    expect(intakeBarSegments([0, 615], 1199, 2000)).toEqual([
      { width: 29.2, left: 584, over: 0, meal: undefined },
      { width: 30.75, left: 615, over: 0, meal: 1 },
    ])
    // Without meals the bar is one stretch, as before.
    expect(intakeBarSegments([], 2500, 2000)).toEqual([
      { width: 100, left: 2000, over: 500, meal: undefined },
    ])
    expect(intakeBarSegments([], 0, 2000)).toEqual([])
  })

  it('gives fractional meals under or at the goal no overage', () => {
    // Running totals of these leave float residue that once read as overage.
    const overages = (meals: number[], consumed: number) =>
      intakeBarSegments(meals, consumed, 2000).map((segment) => segment.over)
    expect(
      overages([312.3, 114.7, 579.1, 340.3, 210.9, 114.8, 115.3], 1787.4),
    ).toEqual([0, 0, 0, 0, 0, 0, 0])
    // These add up to exactly the goal.
    expect(overages([376.5, 304.1, 101.7, 1217.7], 2000)).toEqual([0, 0, 0, 0])
  })

  it('keeps an open meal lit while the others step back, never the overage', () => {
    const { container } = render(
      <IntakeBar
        consumed={2127}
        goal={2000}
        meals={[1877, 250]}
        openMeal={0}
      />,
    )
    const [first, crossing] = container.querySelectorAll('.bg-kcal-left-bar')
    expect(first.classList).not.toContain('opacity-40')
    expect(crossing.classList).toContain('opacity-40')
    expect(container.querySelector('[data-overage]')?.classList).not.toContain(
      'opacity-40',
    )
  })

  it('ticks the goal and turns only the overage berry when over', () => {
    const over = render(<IntakeBar consumed={2500} goal={2000} />)
    const tick = over.container.querySelector<HTMLElement>('[data-goal-tick]')
    expect(tick?.style.left).toBe('80%')
    // Up to the goal stays the left colour; only the overage is berry.
    const base = over.container.querySelector<HTMLElement>('.bg-kcal-left-bar')
    expect(base?.style.flex).toBe('2000 1 0%')
    expect(
      over.container.querySelector<HTMLElement>('[data-overage]')?.style.flex,
    ).toBe('500 1 0%')
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
