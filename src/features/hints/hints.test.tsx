// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hint } from '../../../convex/lib/hints'

const { mutate, server, device } = vi.hoisted(() => ({
  mutate: vi.fn<(name: string, args: unknown) => Promise<null>>(() =>
    Promise.resolve(null),
  ),
  server: {
    eligible: undefined as Hint[] | undefined,
    connected: undefined as boolean | undefined,
  },
  device: { platform: 'other', suggest: false },
}))

vi.mock('@/features/households/convex-hooks', () => ({
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'hints:assistantConnected'
      ? server.connected
      : server.eligible,
  useMutation:
    (reference: Parameters<typeof getFunctionName>[0]) => (args: unknown) =>
      mutate(getFunctionName(reference), args),
}))
vi.mock('@/features/install/install-provider', () => ({
  useInstall: () => device,
}))
vi.mock('@/features/install/install-entry', () => ({
  InstallEntry: () => <p>Install suggestion</p>,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, ...props }: { to: string }) => <a href={to} {...props} />,
}))

import { AssistantListEmpty, resetHintLaunch, TodayHint } from './hints'

function show(visible = true) {
  return render(<TodayHint today="2026-04-10" visible={visible} />)
}

describe('TodayHint', () => {
  beforeEach(() => {
    resetHintLaunch()
    server.eligible = undefined
    Object.assign(device, { platform: 'other', suggest: false })
  })
  afterEach(() => {
    cleanup()
    mutate.mockClear()
  })

  it('shows the first qualified hint once per launch and marks it seen', () => {
    server.eligible = ['assistant', 'history']
    show()
    expect(
      screen.getByRole('heading', { name: 'Log by chatting' }),
    ).toBeTruthy()
    expect(mutate.mock.calls).toEqual([
      ['hints:setSeen', { hint: 'assistant' }],
    ])

    // Seen on the server, it drops out of the list; the slot keeps it.
    server.eligible = ['history']
    cleanup()
    show()
    expect(
      screen.getByRole('heading', { name: 'Log by chatting' }),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('heading')).toBeNull()
    cleanup()
    show()
    // No second hint before the next launch.
    expect(screen.queryByRole('heading')).toBeNull()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('waits while Today is busy, then claims the slot', () => {
    server.eligible = ['history']
    const view = show(false)
    expect(mutate).not.toHaveBeenCalled()
    view.rerender(<TodayHint today="2026-04-10" visible />)
    expect(
      screen.getByRole('link', { name: 'Open History' }).getAttribute('href'),
    ).toBe('/history')
  })

  it('offers the widget only on an iPhone or iPad', () => {
    server.eligible = ['widget']
    show()
    expect(screen.queryByRole('heading')).toBeNull()

    cleanup()
    device.platform = 'ios'
    show()
    expect(
      screen.getByRole('heading', { name: 'Calories left, at a glance' }),
    ).toBeTruthy()
  })

  it('falls back to the install suggestion, which keeps its own dismissal', () => {
    server.eligible = []
    device.suggest = true
    show()
    expect(screen.getByText('Install suggestion')).toBeTruthy()
    expect(mutate).not.toHaveBeenCalled()
  })
})

describe('AssistantListEmpty', () => {
  afterEach(() => cleanup())

  function showEmpty() {
    return render(
      <AssistantListEmpty
        title="Nothing cooked yet"
        example="Save my chili as a batch."
      >
        Tell your AI assistant what you cooked.
      </AssistantListEmpty>,
    )
  }

  it('offers setup only to accounts without an assistant', () => {
    server.connected = false
    showEmpty()
    expect(
      screen.getByRole('link', { name: 'Set up an assistant' }),
    ).toBeTruthy()

    cleanup()
    server.connected = true
    showEmpty()
    expect(
      screen.queryByRole('link', { name: 'Set up an assistant' }),
    ).toBeNull()
    expect(screen.getByText('“Save my chili as a batch.”')).toBeTruthy()
  })

  it('copies the example request', async () => {
    server.connected = true
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    showEmpty()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('Save my chili as a batch.')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy()
  })
})
