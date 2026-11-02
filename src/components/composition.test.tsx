import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AppPending } from './app-pending'
afterEach(cleanup)
it('renders the application pending state', () => {
  render(<AppPending />)
  expect(
    screen.getByRole('heading', { name: 'Preparing your dashboard' }),
  ).toBeTruthy()
})
