// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CustomIngredientSwitchRow } from '@/components/nutrition/ingredient-line-controls'

describe('CustomIngredientSwitchRow', () => {
  afterEach(cleanup)

  it('gives each switch a distinct accessible name', () => {
    render(
      <CustomIngredientSwitchRow
        ignoreCalories={false}
        onIgnoreCaloriesChange={vi.fn()}
        saveToCatalog={false}
        onSaveToCatalogChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('switch', { name: 'Ignore calories' })).toBeTruthy()
    expect(
      screen.getByRole('switch', { name: 'Save to ingredient catalog' }),
    ).toBeTruthy()
  })
})
