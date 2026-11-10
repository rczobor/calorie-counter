// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const device = vi.hoisted(() => ({ platform: 'other' }))

vi.mock('@/features/install/install-provider', () => ({
  useInstall: () => device,
}))
vi.mock('@/components/page/settings-breadcrumbs', () => ({
  SettingsBreadcrumbs: () => null,
}))
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: ({ to, ...props }: { to: string }) => <a href={to} {...props} />,
}))

import { Route } from './settings.tips'

const TipsPage = Route.options.component as ComponentType

describe('Tips', () => {
  afterEach(() => cleanup())

  it('offers the iPhone widget tip only on iOS', () => {
    render(<TipsPage />)
    expect(screen.getByText('Log by chatting')).toBeTruthy()
    expect(screen.queryByText('Calories left, at a glance')).toBeNull()

    cleanup()
    device.platform = 'ios'
    render(<TipsPage />)
    expect(screen.getByText('Calories left, at a glance')).toBeTruthy()
  })
})
