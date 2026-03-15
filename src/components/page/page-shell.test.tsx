// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  ConfigMissingState,
  LoadingSkeletonState,
} from '@/components/page/page-states'
import { PageShell } from '@/components/page/page-shell'

describe('page shell and states', () => {
  it('renders page shell with archived toggle', () => {
    const onChange = vi.fn()

    render(
      <PageShell
        title="Catalog"
        showArchived={false}
        onShowArchivedChange={onChange}
      >
        <div>Content</div>
      </PageShell>,
    )

    expect(screen.getByRole('heading', { name: 'Catalog' })).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('renders standard config and loading states', () => {
    render(<ConfigMissingState />)
    expect(screen.getAllByText('Connect Convex First').length).toBeGreaterThan(
      0,
    )

    render(<LoadingSkeletonState title="Loading page" />)
    expect(screen.getByRole('heading', { name: 'Loading page' })).toBeTruthy()
  })
})
