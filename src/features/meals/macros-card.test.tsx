import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MacrosCard } from './macros-card'

afterEach(cleanup)

const macros = {
  proteinG: 91.6,
  carbsG: 180.2,
  fatG: 60,
  coveredCalories: 1600,
}

describe('day macros card', () => {
  it('shows progress for macros with a goal and grams for the rest', () => {
    render(
      <MacrosCard
        day={{
          macros,
          macroTargets: { proteinG: 131.2, proteinGPerKg: 1.6, fatG: 70 },
          proteinPerKg: 1.12,
        }}
      />,
    )
    const card = screen.getByRole('region', { name: 'Macros' })
    expect(card.textContent).toContain('Protein1.1 / 1.6 g/kg92 / 131 g')
    expect(card.textContent).toContain('Carbs180 g')
    expect(card.textContent).toContain('Fat60 / 70 g')
  })

  it('shows goals on a day with nothing logged yet', () => {
    render(<MacrosCard day={{ macroTargets: { carbsG: 250 } }} />)
    expect(
      screen.getByRole('region', { name: 'Macros' }).textContent,
    ).toContain('Carbs0 / 250 g')
  })

  it('shows nothing without macros or goals', () => {
    const { container } = render(<MacrosCard day={{}} />)
    expect(container.textContent).toBe('')
  })
})
