import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MacrosCard } from './macros-card'

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
    expect(card.textContent).toContain('Protein81 g to go51 / 132 g')
    expect(card.textContent).toContain('Carbs156 g')
    // Past a goal is not an error: it is met.
    expect(card.textContent).toContain('FatGoal met71 / 70 g')
    expect(card.textContent).toContain('Protein: 0.6 / 1.6 g/kg')
    fireEvent.click(card)
    expect(onOpen).toHaveBeenCalled()
  })

  it('shows goals on a day with nothing logged yet', () => {
    render(
      <MacrosCard day={{ macroTargets: { carbsG: 250 } }} onOpen={vi.fn()} />,
    )
    expect(screen.getByRole('button').textContent).toContain(
      'Carbs250 g to go0 / 250 g',
    )
  })

  it('stays hidden for a person without macro goals, even with macros', () => {
    const { container } = render(
      <MacrosCard day={{ macros }} onOpen={vi.fn()} />,
    )
    expect(container.textContent).toBe('')
  })
})
