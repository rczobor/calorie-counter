// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Header, { BottomNavigation } from './Header'

const { consent } = vi.hoisted(() => ({ consent: vi.fn() }))
vi.mock('@/integrations/clerk/config', () => ({ isClerkConfigured: true }))
vi.mock('@/integrations/convex/config', () => ({ isConvexConfigured: true }))
vi.mock('@clerk/react', () => ({
  Show: ({ children }: { children: ReactNode }) => children,
}))
vi.mock('../integrations/clerk/header-user.tsx', () => ({
  default: () => null,
}))
vi.mock('./theme-selector', () => ({ default: () => null }))
vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: () => consent(),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: (props: {
    to: string
    children: ReactNode
    className?: string
    'aria-current'?: 'page'
    'aria-label'?: string
  }) => (
    <a
      href={props.to}
      className={props.className}
      aria-current={props['aria-current']}
      aria-label={props['aria-label']}
    >
      {props.children}
    </a>
  ),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => string
  }) => select({ location: { pathname: '/' } }),
  useNavigate: () => vi.fn(),
}))

afterEach(cleanup)

function currentLinks() {
  render(
    <>
      <Header />
      <BottomNavigation />
    </>,
  )
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.getAttribute('href'))
}

describe('navigation under the consent screen', () => {
  it('marks no tab as current while consent is pending', () => {
    consent.mockReturnValue({ accepted: false })
    expect(currentLinks()).toEqual([])
  })

  it('marks Today as current once consent is given or still loading', () => {
    consent.mockReturnValue({ accepted: true })
    expect(currentLinks()).toEqual(['/', '/'])
    cleanup()
    consent.mockReturnValue(undefined)
    expect(currentLinks()).toEqual(['/', '/'])
  })
})
