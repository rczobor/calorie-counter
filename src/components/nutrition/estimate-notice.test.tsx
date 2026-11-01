import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EstimateNotice } from './estimate-notice'

afterEach(cleanup)

describe('nutrition source display', () => {
  it('keeps legacy estimates distinct from supplied nutrition values', () => {
    const { rerender } = render(
      <EstimateNotice
        provenance={{ source: 'Model estimate', assumptions: 'One small bowl' }}
      />,
    )
    expect(screen.getByText('Estimated')).toBeTruthy()
    rerender(
      <EstimateNotice
        provenance={{
          kind: 'provided',
          source: 'User-provided label',
          assumptions: '14 kcal per serving; not independently verified',
        }}
      />,
    )
    expect(screen.queryByText('Estimated')).toBeNull()
    expect(screen.getByText('Nutrition source')).toBeTruthy()
    expect(screen.getByText(/not independently verified/)).toBeTruthy()
    rerender(<EstimateNotice />)
    expect(screen.queryByText('Nutrition source')).toBeNull()
  })
})
