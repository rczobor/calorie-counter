// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { expect, it, vi } from 'vitest'

const mockUseConvexAuth = vi.fn(() => {
  throw new Error('useConvexAuth must not run without a Convex provider')
})

vi.mock('@clerk/react', () => ({
  ClerkLoaded: ({ children }: PropsWithChildren) => children,
  ClerkLoading: () => null,
  ClerkProvider: ({ children }: PropsWithChildren) => children,
  Show: ({ children }: PropsWithChildren) => children,
  SignInButton: ({ children }: PropsWithChildren) => children,
  UserButton: () => null,
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => mockUseConvexAuth(),
}))

vi.mock('../integrations/clerk/config', () => ({
  isClerkConfigured: true,
}))

vi.mock('../integrations/convex/config', () => ({
  convexUrl: '',
  isConvexConfigured: false,
}))

vi.mock('../integrations/clerk/provider', () => ({
  default: ({ children }: PropsWithChildren) => children,
}))

vi.mock('../integrations/convex/provider', () => ({
  default: ({ children }: PropsWithChildren) => children,
}))

import { AuthGate } from './__root'

it('shows Convex setup guidance without invoking auth outside a provider', () => {
  render(
    <AuthGate>
      <p>Protected content</p>
    </AuthGate>,
  )

  expect(screen.getByText('Data setup required')).toBeTruthy()
  expect(screen.getByText(/VITE_CONVEX_URL/)).toBeTruthy()
  expect(screen.queryByText('Protected content')).toBeNull()
  expect(mockUseConvexAuth).not.toHaveBeenCalled()
})
