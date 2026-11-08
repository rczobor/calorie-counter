// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ConfigMissingState } from '@/components/page/page-states'
import { PageShell } from '@/components/page/page-shell'

describe('page shell and states', () => {
  it('renders the page title', () => {
    render(
      <PageShell title="Catalog">
        <div>Content</div>
      </PageShell>,
    )

    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeTruthy()
  })

  it('renders the missing configuration state', () => {
    render(<ConfigMissingState />)
    expect(screen.getAllByText('Connect Convex First').length).toBeGreaterThan(
      0,
    )
  })
})
