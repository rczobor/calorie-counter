import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { apportion, MacrosCard } from './macros-card'

afterEach(cleanup)

const macros = { proteinG: 51, carbsG: 156, fatG: 71, coveredCalories: 1600 }

describe('day macros card', () => {
  it('says what is left for macros with a goal and grams for the rest', () => {
    const onOpen = vi.fn()
    render(
      <MacrosCard
        day={{
          macros,
          macroTargets: { proteinG: 132, proteinGPerKg: 1.6, fatG: 70 },
          proteinPerKg: 0.62,
        }}
        onOpen={onOpen}
      />,
    )
    const card = screen.getByRole('button', { name: /Show macros by meal/ })
    expect(card.textContent).toContain('Protein81 g left51 / 132 g')
    expect(card.textContent).toContain('CarbsNo goal156 g')
    // Past a goal is not an error: it is reached.
    expect(card.textContent).toContain('FatReached71 / 70 g')
    expect(card.textContent).toContain('Protein: 0.6 / 1.6 g/kg')
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalled()
  })

  it('shows goals on a day with nothing logged yet', () => {
    render(
      <MacrosCard day={{ macroTargets: { carbsG: 250 } }} onOpen={vi.fn()} />,
    )
    expect(screen.getByRole('button').textContent).toContain(
      'Carbs250 g left0 / 250 g',
    )
  })

  it('stays hidden for a person without macro goals, even with macros', () => {
    const { container } = render(
      <MacrosCard day={{ macros }} onOpen={vi.fn()} />,
    )
    expect(container.textContent).toBe('')
  })

  it('rounds each meal so the meals add up to the day', () => {
    // 36.6 + 15.3 rounds to 37 + 15 = 52 and the day to 51.9 = 52; plain
    // rounding of 36.4 + 15.4 would give 51 against a day of 52.
    expect(apportion([36.6, 15.3])).toEqual({ total: 52, parts: [37, 15] })
    expect(apportion([36.4, 15.45])).toEqual({ total: 52, parts: [36, 16] })
    expect(apportion([0, 0])).toEqual({ total: 0, parts: [0, 0] })
  })
})
