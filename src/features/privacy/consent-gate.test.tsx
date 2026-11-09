// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRIVACY_NOTICE_VERSION } from '../../../convex/lib/privacy'
import { ConsentGate } from './consent-gate'

const { consent, accept } = vi.hoisted(() => ({
  consent: vi.fn(),
  accept: vi.fn(),
}))
vi.mock('convex/react', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'privacy:consent' ? consent() : [],
  useMutation: () => accept,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/page/page-placeholder', () => ({
  PagePlaceholder: ({ label }: { label: string }) => (
    <p role="status">{label}</p>
  ),
}))
vi.mock('./delete-account', () => ({ DeleteAccount: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderGate() {
  return render(
    <ConsentGate>
      <p>App</p>
    </ConsentGate>,
  )
}

describe('consent gate', () => {
  it('waits for the consent check before showing anything', () => {
    consent.mockReturnValue(undefined)
    renderGate()
    expect(screen.getByRole('status').textContent).toBe(
      'Checking your privacy settings',
    )
    expect(screen.queryByText('App')).toBeNull()
  })

  it('opens the app once the account has consented', () => {
    consent.mockReturnValue({ accepted: true })
    renderGate()
    expect(screen.getByText('App')).toBeTruthy()
  })

  it('asks for explicit consent to the notice version it links to', async () => {
    consent.mockReturnValue({ accepted: false })
    accept.mockRejectedValueOnce(new Error('Offline'))
    renderGate()
    expect(screen.queryByText('App')).toBeNull()
    expect(
      screen
        .getByRole('link', { name: /^Privacy notice Updated / })
        .getAttribute('href'),
    ).toBe('/privacy')

    fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Agree and continue' }))
    expect(accept).toHaveBeenLastCalledWith({ version: PRIVACY_NOTICE_VERSION })
    expect(accept).toHaveBeenCalledTimes(2)
  })
})
