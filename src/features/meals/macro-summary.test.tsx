import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { MacroSummary } from './macro-summary'

afterEach(cleanup)

const macros = {
  proteinG: 91.6,
  carbsG: 180.2,
  fatG: 60,
  coveredCalories: 1600,
}

describe('day macro summary', () => {
  it('shows whole grams and how much of the day they cover', () => {
    render(<MacroSummary macros={macros} consumedCalories={2000} />)
    const summary = screen.getByRole('region', { name: 'Macros' })
    expect(summary.textContent).toContain('Protein92 g')
    expect(summary.textContent).toContain('Carbs180 g')
    expect(summary.textContent).toContain('Fat60 g')
    expect(summary.textContent).toContain('Macros cover 80% of logged kcal')
  })

  it('drops the coverage line when every food has macros', () => {
    render(<MacroSummary macros={macros} consumedCalories={1600} />)
    expect(screen.queryByText(/Macros cover/)).toBeNull()
  })

  it('shows nothing on a day without macros', () => {
    const { container } = render(
      <MacroSummary macros={undefined} consumedCalories={1600} />,
    )
    expect(container.textContent).toBe('')
  })
})
