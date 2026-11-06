import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv(
    'VITE_CLERK_PUBLISHABLE_KEY',
    'pk_test_cGVyZm9ybWFuY2UuY2xlcmsuYWNjb3VudHMuZGV2JA==',
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.doUnmock('@clerk/react/internal')
})

it('selects the shared UI only for a React version supported by Clerk', async () => {
  vi.doMock('@clerk/react/internal', async (original) => ({
    ...(await original<typeof import('@clerk/react/internal')>()),
    IS_REACT_SHARED_VARIANT_COMPATIBLE: true,
  }))
  const { sharedClerkUiUrl } = await import('./config')
  expect(sharedClerkUiUrl).toMatch(
    /^https:\/\/performance\.clerk\.accounts\.dev\/npm\/@clerk\/ui@[^/]+\/dist\/ui\.shared\.browser\.js$/,
  )
})

it('keeps the default UI loader for unsupported React versions', async () => {
  vi.doMock('@clerk/react/internal', async (original) => ({
    ...(await original<typeof import('@clerk/react/internal')>()),
    IS_REACT_SHARED_VARIANT_COMPATIBLE: false,
  }))
  const { sharedClerkUiUrl } = await import('./config')
  expect(sharedClerkUiUrl).toBeUndefined()
})

it('does not load Clerk UI without a configured key', async () => {
  vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '')
  const { isClerkConfigured, sharedClerkUiUrl } = await import('./config')
  expect(isClerkConfigured).toBe(false)
  expect(sharedClerkUiUrl).toBeUndefined()
})
