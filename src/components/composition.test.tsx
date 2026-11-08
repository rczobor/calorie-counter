import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { PagePlaceholderView } from './page/page-placeholder'
afterEach(cleanup)
it('takes the shape of the page being opened', () => {
  render(
    <PagePlaceholderView
      label="Loading page"
      pathname="/history"
      searchStr=""
    />,
  )
  const status = screen.getByRole('status', { name: 'Loading page' })
  expect(status.textContent).toContain('History')
  expect(status.textContent).toContain('Daily average')
})
